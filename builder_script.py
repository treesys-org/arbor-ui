
import os
import json
import datetime
import re
import uuid
import shutil
import time
import sys

# ==============================================================================
#  🌳 ARBOR BUILDER V3.7 (EMBEDDED INTRO)
# ==============================================================================
# 1. LIVE MODE (The "Rolling" Branch):
#    - Priority Source: ./content/rolling
#    - Fallback Source: ./content (Backward compatibility)
#    - Output: ./data/data.json + ./data/nodes/* + ./data/content/*
#
# 2. ARCHIVE MODE (The "Frozen" Releases):
#    - Source: ./content/releases/{YEAR}
#    - Output: ./data/releases/{YEAR}.json
#    - Strategy: MONOLITHIC (FAT JSON).
#
# 3. INDEX (PORTABLE):
#    - Output: ./data/arbor-index.json
#    - URLs are relative to the data folder (e.g., "./data.json").
# ==============================================================================

# --- CONFIGURATION ---
DEFAULT_UNIVERSE_ID = "arbor-standard" 
DEFAULT_UNIVERSE_NAME = "Arbor Standard Curriculum"
NAMESPACE = "org.arbor.knowledge"

# PATHS CONFIGURATION
BASE_CONTENT_DIR = "./content"

# Output Paths
DATA_ROOT_DIR = "./data"
API_DIR = os.path.join(DATA_ROOT_DIR, "nodes")
CONTENT_API_DIR = os.path.join(DATA_ROOT_DIR, "content") 
SEARCH_DIR = os.path.join(DATA_ROOT_DIR, "search") 
OUTPUT_FILE = os.path.join(DATA_ROOT_DIR, "data.json") 
RELEASES_OUT_DIR = os.path.join(DATA_ROOT_DIR, "releases")

# IMPORTANT: Index is now inside data/ to be self-contained
INDEX_FILE = os.path.join(DATA_ROOT_DIR, "arbor-index.json") 
CACHE_FILE = ".arbor_build_cache.json"

ALLOWED_EXTENSIONS = {'.md'}

# Global trackers
BUILD_CACHE = {}
GENERATED_CONTENT_PATHS = set()
STATS = {"cached": 0, "processed": 0, "deleted": 0}

# --- CACHE SYSTEM ---

def load_cache():
    global BUILD_CACHE
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                BUILD_CACHE = json.load(f)
        except:
            BUILD_CACHE = {}

def save_cache():
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(BUILD_CACHE, f, indent=0)
    except Exception as e:
        print(f"⚠️ Warning: Could not save build cache: {e}")

# --- PARSERS ---

def parse_frontmatter(content):
    meta = {}
    clean_content = content
    match = re.match(r'^---\n(.*?)\n---\n(.*)', content, re.DOTALL)
    if match:
        frontmatter_str, clean_content = match.groups()
        clean_content = clean_content.strip()
        for line in frontmatter_str.split('\n'):
            if ':' in line:
                key, val = line.split(':', 1)
                meta[key.strip().lower()] = val.strip().strip('"\'')
    return meta, clean_content

def parse_arbor_format(content):
    meta = {}
    content_lines = []
    lines = content.split('\n')
    parsing_metadata = True

    for line in lines:
        stripped = line.strip()
        if parsing_metadata and not stripped: continue

        if parsing_metadata and stripped.startswith('@'):
            if stripped.lower() == '@exam':
                meta['type'] = 'exam'
                continue

            if ':' in stripped:
                key_part, val_part = stripped.split(':', 1)
                raw_key = key_part[1:].strip().lower()
                val = val_part.strip()
                if raw_key in ['image', 'img', 'video', 'audio', 'quiz', 'section', 'h1', 'h2']:
                     parsing_metadata = False
                     content_lines.append(line)
                else:
                     meta[raw_key] = val
            else:
                 parsing_metadata = False
                 content_lines.append(line)
        else:
            if parsing_metadata: parsing_metadata = False
            content_lines.append(line)
            
    return meta, '\n'.join(content_lines).strip()

def get_folder_metadata(folder_path):
    meta_path = os.path.join(folder_path, "meta.json")
    meta_data = {}
    if os.path.exists(meta_path):
        try:
            with open(meta_path, 'r', encoding='utf-8-sig') as f:
                meta_data = json.load(f)
        except: meta_data = {}

    if "uuid" not in meta_data:
        meta_data["uuid"] = str(uuid.uuid4())
        try:
            with open(meta_path, 'w', encoding='utf-8') as f:
                json.dump(meta_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            # Non-blocking error log
            print(f"   [!] Error writing meta.json in {folder_path}: {e}")

    return meta_data

def tokenize(text):
    if not text: return []
    text = text.lower()
    words = re.findall(r'\w+', text)
    return [w for w in words if len(w) > 2]

def add_to_search_shards(node, shards_dict):
    text_to_index = f"{node.get('name', '')} {node.get('description', '')}"
    words = tokenize(text_to_index)
    target_shards = set()
    for word in words:
        if len(word) >= 2:
            prefix = word[:2]
            target_shards.add(prefix)
            
    for prefix in target_shards:
        if prefix not in shards_dict: shards_dict[prefix] = []
        search_entry = {
            "id": node.get("id"),
            "n": node.get("name"),
            "t": node.get("type"),
            "i": node.get("icon"),
            "d": node.get("description"),
            "p": node.get("path"),
            "l": node.get("lang"),
            "c": node.get("isCertifiable", False)
        }
        shards_dict[prefix].append(search_entry)

# --- RECURSIVE BUILDER ---

def build_tree_recursive(path, lang_folder, is_archive_mode, parent_id=None, node_collector=None, breadcrumb_path="", relative_slug_path=""):
    if node_collector is None: node_collector = []

    name = os.path.basename(path)
    name_slug = re.sub(r'[^a-zA-Z0-9]+', '-', os.path.splitext(name)[0]).lower().strip('-')
    current_slug_path = f"{relative_slug_path}/{name_slug}" if relative_slug_path else name_slug
    clean_source_path = os.path.relpath(path, ".").replace("\\", "/")

    # FOLDER
    if os.path.isdir(path):
        meta = get_folder_metadata(path)
        display_name = meta.get("name", name.replace('_', ' '))
        node_id = f"{NAMESPACE}::{meta.get('uuid')}"
        
        node = {
            "id": node_id, 
            "name": display_name,
            "parentId": parent_id, 
            "icon": meta.get("icon", "📁"), 
            "description": meta.get("description", ""),
            "expanded": False, 
            "status": "available",
            "type": "branch",
            "order": meta.get("order", "999"),
            "apiPath": f"{lang_folder.lower()}/{current_slug_path}",
            "totalLeaves": 0,
            "leafIds": [],
            "sourcePath": clean_source_path,
            "isCertifiable": False
        }
        
        current_breadcrumb = f"{breadcrumb_path} / {display_name}" if breadcrumb_path else display_name
        node['path'] = current_breadcrumb

        child_items = sorted([item for item in os.listdir(path) if not item.startswith('.') and item != 'meta.json']) if os.path.exists(path) else []
        
        if child_items:
            # Important: Archives default to "Loaded" (False), Live defaults to "Unloaded" (True)
            node["hasUnloadedChildren"] = not is_archive_mode 
            children_for_api_file = []
            
            for item in child_items:
                item_path = os.path.join(path, item)
                child_node = build_tree_recursive(item_path, lang_folder, is_archive_mode, node_id, node_collector, current_breadcrumb, current_slug_path)
                if child_node:
                    children_for_api_file.append(child_node)
                    if child_node.get('type') in ['leaf', 'exam']:
                        node["totalLeaves"] += 1
                        node["leafIds"].append(child_node['id'])
                    else:
                        node["totalLeaves"] += child_node.get('totalLeaves', 0)
                        if 'leafIds' in child_node: node["leafIds"].extend(child_node['leafIds'])
            
            children_for_api_file.sort(key=lambda x: (int(x.get('order', 999)), x.get('name', '')))
            if any(child.get('type') == 'exam' for child in children_for_api_file): node['isCertifiable'] = True

            # SPLIT LOGIC
            if is_archive_mode:
                # Monolithic: Children stay in the parent object
                node["children"] = children_for_api_file
                node["hasUnloadedChildren"] = False
            else:
                # Live: Children go to a separate JSON
                api_relative_path = os.path.join(lang_folder.lower(), *current_slug_path.split('/')) + ".json"
                api_filepath = os.path.join(API_DIR, api_relative_path)
                
                if api_filepath:
                    os.makedirs(os.path.dirname(api_filepath), exist_ok=True)
                    with open(api_filepath, 'w', encoding='utf-8') as f:
                        json.dump(children_for_api_file, f, ensure_ascii=False, separators=(',', ':'))

    # FILE
    else: 
        ext = os.path.splitext(path)[1].lower()
        if ext in ALLOWED_EXTENSIONS:
            node_id = f"{parent_id}__{name_slug}"
            content_rel_path = f"{lang_folder.lower()}/{current_slug_path}.json"
            content_full_path = os.path.join(CONTENT_API_DIR, content_rel_path)
            
            if not is_archive_mode:
                GENERATED_CONTENT_PATHS.add(os.path.abspath(content_full_path))

            mtime = os.path.getmtime(path)
            cached_data = BUILD_CACHE.get(path)
            
            needs_processing = True
            # In live mode, we trust cache to skip file writing. In archive mode, we must load content to memory.
            if not is_archive_mode and cached_data and cached_data.get('mtime') == mtime and os.path.exists(content_full_path):
                needs_processing = False
                meta = cached_data.get('meta', {})
                STATS["cached"] += 1
            
            node = {
                "id": node_id,
                "parentId": parent_id,
                "type": "leaf",
                "name": os.path.splitext(name)[0].replace('_', ' '),
                "icon": "📄",
                "sourcePath": clean_source_path,
                "contentPath": content_rel_path
            }

            if needs_processing or is_archive_mode:
                try:
                    with open(path, 'r', encoding='utf-8-sig') as f:
                        raw_content = f.read()
                    
                    if ext == '.md' and raw_content.startswith('---'):
                         meta, content = parse_frontmatter(raw_content)
                    else:
                         meta, content = parse_arbor_format(raw_content)
                    
                    # SPLIT LOGIC
                    if is_archive_mode:
                        # EMBED IT! This is the key to the Fat JSON.
                        node['content'] = content 
                    else:
                        # Write it to sidecar file
                        os.makedirs(os.path.dirname(content_full_path), exist_ok=True)
                        with open(content_full_path, 'w', encoding='utf-8') as f:
                             json.dump({"content": content}, f, ensure_ascii=False)
                    
                    if not is_archive_mode:
                        BUILD_CACHE[path] = {'mtime': mtime, 'meta': meta}
                        STATS["processed"] += 1

                except Exception as e:
                    print(f"   [!] Error reading {path}: {e}")
                    meta = {}
            
            node.update(meta)
            node['path'] = f"{breadcrumb_path} / {node['name']}"
            if node.get('type') == 'exam': node['icon'] = '⚔️'
                
        else:
            return None

    search_node = {
        "id": node.get("id"), "name": node.get("name"), "type": node.get("type"),
        "icon": node.get("icon"), "description": node.get("description"), 
        "lang": lang_folder.upper(), "path": node.get("path"), 
        "isCertifiable": node.get("isCertifiable", False)
    }
    node_collector.append(search_node)
    
    # In Live Mode, strip children to keep data.json small (Lazy Load)
    if not is_archive_mode and 'children' in node: 
        del node['children']
        
    return node

def clean_orphans():
    # SAFETY: Only run if target directory exists
    if not os.path.exists(CONTENT_API_DIR): return
    
    # SAFETY: Only run if we actually generated something.
    if len(GENERATED_CONTENT_PATHS) == 0:
        return

    for root, dirs, files in os.walk(CONTENT_API_DIR):
        for file in files:
            full_path = os.path.abspath(os.path.join(root, file))
            if full_path not in GENERATED_CONTENT_PATHS:
                try: 
                    os.remove(full_path)
                    STATS["deleted"] += 1
                except: pass
        
        # Clean empty dirs
        if not os.listdir(root) and root != os.path.abspath(CONTENT_API_DIR):
            try: os.rmdir(root)
            except: pass

def get_readme_content(source_path):
    """
    Looks for INTRO.md or README.md in the source folder or its parent.
    Returns the content string or None.
    """
    if not source_path or not os.path.exists(source_path):
        return None
        
    candidates = ["INTRO.md", "intro.md", "README.md", "readme.md"]
    
    # 1. Look in source folder (e.g. content/releases/v1/)
    for c in candidates:
        p = os.path.join(source_path, c)
        if os.path.exists(p):
            try:
                with open(p, 'r', encoding='utf-8-sig') as f:
                    content = f.read()
                    # Clean frontmatter if present
                    return re.sub(r'^---\n[\s\S]*?\n---\n', '', content).strip()
            except: pass
            
    # 2. Look in parent folder (e.g. content/ if scanning content/rolling)
    # Only do this if we are likely in a structured subfolder
    parent = os.path.dirname(source_path)
    if os.path.exists(parent):
        for c in candidates:
            p = os.path.join(parent, c)
            if os.path.exists(p):
                try:
                    with open(p, 'r', encoding='utf-8-sig') as f:
                        content = f.read()
                        return re.sub(r'^---\n[\s\S]*?\n---\n', '', content).strip()
                except: pass
                
    return None

def process_universe(source_root_path, is_archive=False):
    
    universe_name = DEFAULT_UNIVERSE_NAME
    universe_id = DEFAULT_UNIVERSE_ID
    
    root_meta_path = os.path.join(source_root_path, "meta.json")
    if os.path.exists(root_meta_path):
        try:
            with open(root_meta_path, 'r', encoding='utf-8') as f:
                root_meta = json.load(f)
                if root_meta.get('name'): universe_name = root_meta.get('name')
                if root_meta.get('id'): universe_id = root_meta.get('id')
        except: pass

    data_structure = {
        "generatedAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "universeId": universe_id,
        "universeName": universe_name,
        "readme": get_readme_content(source_root_path), # <--- EMBEDDED INTRO
        "languages": {}
    }

    # Find languages (folders)
    excluded = ['.', 'releases', 'rolling']
    
    if not os.path.exists(source_root_path):
        return data_structure

    language_folders = sorted([
        d for d in os.listdir(source_root_path) 
        if os.path.isdir(os.path.join(source_root_path, d)) 
        and not any(d.startswith(prefix) for prefix in excluded)
        and d not in excluded
    ])
    
    for lang_folder in language_folders:
        if not is_archive: print(f"🔨 Processing Language: {lang_folder.upper()}")
        lang_path = os.path.join(source_root_path, lang_folder)
        
        root_id = f"{universe_id}-{lang_folder.lower()}-root"
        root_name = f"{universe_name} ({lang_folder.upper()})"
        
        root_node = { 
            "id": root_id, "name": root_name, "parentId": None, 
            "icon": "🌳", "expanded": True, "status": "available", 
            "type": "root", "description": f"{lang_folder.upper()} Curriculum", 
            "path": root_name,
            "sourcePath": os.path.relpath(lang_path, ".").replace("\\", "/")
        }
        
        lang_search_nodes = []
        root_children_nodes = []
        top_level_items = sorted([item for item in os.listdir(lang_path) if not item.startswith('.') and item != 'meta.json'])

        for item in top_level_items:
            item_path = os.path.join(lang_path, item)
            branch_search_nodes = []
            top_node = build_tree_recursive(item_path, lang_folder, is_archive, root_node['id'], branch_search_nodes, root_name)
            
            if top_node:
                root_children_nodes.append(top_node)
                lang_search_nodes.extend(branch_search_nodes)

        # Write Search Shards (ONLY FOR LIVE MODE)
        if not is_archive:
            lang_shards = {}
            for node in lang_search_nodes:
                add_to_search_shards(node, lang_shards)
            
            lang_search_dir = os.path.join(SEARCH_DIR, lang_folder.upper())
            os.makedirs(lang_search_dir, exist_ok=True)
            
            for prefix, items in lang_shards.items():
                safe_prefix = re.sub(r'[^a-z0-9]', '', prefix)
                if safe_prefix:
                    shard_subdir = os.path.join(lang_search_dir, safe_prefix[0])
                    os.makedirs(shard_subdir, exist_ok=True)
                    with open(os.path.join(shard_subdir, f"{safe_prefix}.json"), 'w', encoding='utf-8') as f:
                        json.dump(items, f, ensure_ascii=False, separators=(',', ':'))

        root_children_nodes.sort(key=lambda x: (int(x.get('order', 999)), x.get('name', '')))
        root_node['children'] = root_children_nodes
        cert_nodes = [n for n in lang_search_nodes if n.get('isCertifiable')]
        root_node['certificates'] = cert_nodes
        data_structure["languages"][lang_folder.upper()] = root_node

    return data_structure

def copy_intro_files():
    """
    Scans for INTRO.md or README.md in content folders and copies it to data/INTRO.md.
    This ensures the intro file is always available relative to data.json for legacy clients.
    """
    # Candidate filenames
    candidates = ["INTRO.md", "intro.md", "README.md", "readme.md"]
    
    # Priority folders:
    # 1. content/rolling/ (New standard)
    # 2. content/ (Legacy standard)
    # 3. . (Root - fallback)
    search_paths = [
        os.path.join(BASE_CONTENT_DIR, "rolling"),
        BASE_CONTENT_DIR,
        "."
    ]
    
    source_file = None
    for path in search_paths:
        if os.path.exists(path):
            for filename in candidates:
                fullpath = os.path.join(path, filename)
                if os.path.exists(fullpath):
                    source_file = fullpath
                    break
        if source_file: break
        
    if source_file:
        dest = os.path.join(DATA_ROOT_DIR, "INTRO.md")
        try:
            shutil.copy2(source_file, dest)
        except: pass

def generate_master_index(current_name):
    print(f"📜 Generating Master Index in {INDEX_FILE}...")
    
    index = {
        "rolling": {
            "id": f"latest-{int(time.time())}",
            "name": f"{current_name} (Rolling)",
            "description": "Latest unstable version. Updates continuously.",
            "url": "./data.json",
            "year": "Rolling"
        },
        "releases": []
    }

    if os.path.exists(RELEASES_OUT_DIR):
        files = sorted(os.listdir(RELEASES_OUT_DIR), reverse=True)
        for f in files:
            if f.endswith(".json"):
                name_no_ext = os.path.splitext(f)[0]
                release_name = f"{current_name} {name_no_ext}"
                try:
                    with open(os.path.join(RELEASES_OUT_DIR, f), 'r', encoding='utf-8') as rf:
                        head = rf.read(1024) 
                        match = re.search(r'"universeName":\s*"([^"]+)"', head)
                        if match: release_name = f"{match.group(1)} ({name_no_ext})"
                except: pass

                index["releases"].append({
                    "id": f"release-{name_no_ext}",
                    "name": release_name,
                    "description": f"Archived snapshot from {name_no_ext}.",
                    "url": f"./releases/{f}",
                    "year": name_no_ext
                })

    with open(INDEX_FILE, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    
    print(f"   - Index updated with {len(index['releases'])} releases.")

def main():
    start_time = time.time()
    print(f"\n🌳 Arbor Builder v3.7 (Embedded Intro)")
    print(f"==================================================")
    
    load_cache()

    if not os.path.exists(BASE_CONTENT_DIR):
        print(f"❌ Error: Base content directory '{BASE_CONTENT_DIR}' not found.")
        sys.exit(1)

    if os.path.exists(SEARCH_DIR): shutil.rmtree(SEARCH_DIR)
    if os.path.exists(API_DIR): shutil.rmtree(API_DIR)
    
    os.makedirs(DATA_ROOT_DIR, exist_ok=True)
    os.makedirs(SEARCH_DIR, exist_ok=True)
    os.makedirs(API_DIR, exist_ok=True)
    os.makedirs(CONTENT_API_DIR, exist_ok=True)
    os.makedirs(RELEASES_OUT_DIR, exist_ok=True)

    # 1. LIVE BUILD
    live_source = os.path.join(BASE_CONTENT_DIR, "rolling")
    live_source_valid = False

    if os.path.exists(live_source):
        print(f"🔨 Building LIVE Universe from: {live_source}")
        live_source_valid = True
    else:
        potential_langs = [d for d in os.listdir(BASE_CONTENT_DIR) if os.path.isdir(os.path.join(BASE_CONTENT_DIR, d)) and len(d) == 2]
        if potential_langs:
            print(f"⚠️  'content/rolling' not found. Falling back to root '{BASE_CONTENT_DIR}'.")
            live_source = BASE_CONTENT_DIR
            live_source_valid = True
        else:
            print(f"⚠️  Notice: No live content found (checked 'rolling' and root). Building empty tree.")

    live_data = process_universe(live_source if live_source_valid else None, is_archive=False)
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f: 
        json.dump(live_data, f, ensure_ascii=False, separators=(',', ':'))
    
    if live_source_valid:
        clean_orphans()
    else:
        print("   - Skipped orphan cleaning (safety mode).")
    
    # 2. ARCHIVE BUILD
    releases_src = os.path.join(BASE_CONTENT_DIR, "releases")
    if os.path.exists(releases_src):
        archives = sorted([d for d in os.listdir(releases_src) if os.path.isdir(os.path.join(releases_src, d))])
        
        if archives:
            print(f"\n🏛️  Compiling {len(archives)} Archives from: {releases_src}")
            for archive_name in archives:
                archive_src = os.path.join(releases_src, archive_name)
                print(f"   - Compiling Snapshot: {archive_name}")
                archive_data = process_universe(archive_src, is_archive=True)
                out_path = os.path.join(RELEASES_OUT_DIR, f"{archive_name}.json")
                with open(out_path, 'w', encoding='utf-8') as f:
                    json.dump(archive_data, f, ensure_ascii=False)

    # 3. UTILITIES
    live_name = live_data.get('universeName', DEFAULT_UNIVERSE_NAME)
    
    # Keep legacy file copy just in case
    copy_intro_files()
    
    generate_master_index(live_name)
    save_cache()

    elapsed = time.time() - start_time
    print(f"==================================================")
    print(f"✅ Build Complete in {elapsed:.2f}s")
    print(f"==================================================\n")
    sys.exit(0)

if __name__ == "__main__":
    main()
