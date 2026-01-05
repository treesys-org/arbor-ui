

# 🌳 Arbor Knowledge Repository

Welcome to the **Arbor Knowledge Source**. This repository contains the raw educational content that powers the Arbor visual learning interface.

Unlike traditional LMS platforms, Arbor is **serverless**. The content is compiled into static JSON files that the frontend consumes directly.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
You need **Python 3** installed on your system to run the build script.

### 2. Directory Structure
All content lives in the `content/` folder. The compiler will generate the interactive API in the `data/` folder.

```text
.
├── builder_script.txt     # ⚙️ The Compiler (Python script)
├── content/               # ✏️ YOUR CONTENT GOES HERE
│   ├── EN/                # English Root
│   │   ├── 01_Science/    # Branch (Folder)
│   │   │   ├── meta.json  # Branch Metadata
│   │   │   └── Intro.md   # Leaf (Lesson)
│   └── ES/                # Spanish Root
└── data/                  # 📤 GENERATED OUTPUT (Do not edit manually)
    ├── data.json          # Main API entry point
    └── nodes/             # Lazy-loaded branches
```

### 3. How to Build
After making changes to the `content/` folder, you must compile the graph.

1.  Open your terminal in this folder.
2.  Run the builder script:
    ```bash
    python builder_script.txt
    ```
3.  This will create or update the `data/` folder containing your compiled API.
4.  **Testing:** To test your changes, you can upload this `data/` folder to a web server or GitHub pages, and then add the URL to `data.json` inside the Arbor App.

---

## 📝 Authoring Guide

Arbor uses standard **Markdown** (`.md`) files. You can use standard Jekyll-style Frontmatter (YAML) or the simplified Arbor metadata tags.

### A. The Header (Metadata)

You can define metadata using the `@` syntax at the top of your `.md` file:

```text
@title: Introduction to Biology
@icon: 🧬
@description: Learn the basics of life.
@order: 1
@discussion: https://community.arbor.org/t/biology-intro/101
```

| Directive | Description |
| :--- | :--- |
| `@title` | The label on the tree node. |
| `@icon` | An emoji (single character) for the node. |
| `@description` | Brief summary shown in search and previews. |
| `@order` | (Optional) Number to sort nodes (1, 2, 3...). |
| `@discussion` | (Optional) URL to a forum thread for discussion. |

Alternatively, standard YAML Frontmatter is also supported:

```yaml
---
title: Introduction to Biology
icon: 🧬
description: Learn the basics of life.
order: 1
discussion: https://community.arbor.org/t/biology-intro/101
---
```

### B. Formatting Text
Write your lesson content using standard Markdown.

*   `# Heading 1` (Main Title)
*   `## Heading 2` (Subtitle)
*   `**Bold**` for emphasis
*   `*Italic*` for subtle emphasis
*   `- List item` for bullet points

### C. Rich Media
Use the `@` syntax to embed media players.

**Images:**
```text
@image: https://upload.wikimedia.org/wikipedia/commons/example.jpg
```

**Videos (YouTube):**
```text
@video: https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

**Audio:**
```text
@audio: https://example.com/podcast.mp3
```

### D. Interactive Quizzes
Insert a quiz anywhere in the text. This acts as a "Gate" that the user must pass.

```text
@quiz: What is the powerhouse of the cell?
@option: Nucleus
@correct: Mitochondria
@option: Ribosome
```
*   `@quiz:` The question text.
*   `@correct:` The right answer.
*   `@option:` A wrong answer.

### E. Structuring Content
You can break your lesson into clear parts using the `@section` tag.

```text
@section: The Kreb's Cycle

Here we discuss the details of the Kreb's cycle...
```

### F. Folder Metadata
To customize a Folder (Branch), place a `meta.json` file inside it.

```json
{
  "name": "Advanced Physics",
  "icon": "⚛️",
  "description": "For 3rd year students.",
  "order": "2"
}
```
*If no `meta.json` is provided, the folder name will be used.*

### G. Special Node Types (Exams)
You can create a "Challenge" or "Exam" node that allows students to **test out** of a module. If a user passes the quiz in this node, **all other nodes in the same folder will be marked as complete automatically**.

To create an exam node, simply add the **`@exam`** tag to the header (no value needed):

```text
@title: Biology Final Exam
@exam
@icon: ⚔️
@description: Prove your skills to skip this module.

@quiz: Question 1...
```

This node will appear as a red diamond in the graph, indicating it is a special challenge.

---

## ⚠️ Important Rules

1.  **Unique Filenames:** Avoid special characters in filenames. Use `01_Intro.md`.
2.  **Valid URLs:** Ensure all `@image` and `@video` links are HTTPS and publicly accessible.
3.  **No HTML:** Do not write raw HTML. Use the provided syntax.
