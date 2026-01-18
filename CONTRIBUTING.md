# 🌳 Contributing to Arbor UI

First off, thank you for considering contributing! Arbor is a community-driven project, and your help is essential for its growth.

This guide will walk you through the simple, "zero-build" architecture of the Arbor frontend.

## ✨ Core Philosophy: Zero Build

Arbor UI is intentionally simple. It uses **no build tools** (No Webpack, Vite, etc.). This makes it incredibly easy for anyone to get started:

1.  Clone the repository.
2.  Open `index.html` in a browser (preferably with a local server extension).
3.  That's it. You're running the app.

All dependencies are loaded via CDN using an `importmap` in `index.html`. All code is written in vanilla JavaScript using native ES Modules.

---

## 🏛️ Architecture Overview

The application follows a classic, centralized state management pattern, similar to Redux or Vuex, but implemented in vanilla JavaScript.

### 1. The Global Store (`src/store.js`)

This is the heart of the application.

*   **Single Source of Truth:** `store.js` holds the entire application state in its `this.state` object. This includes everything from the current theme (`'dark'`) to the loaded knowledge tree (`data`) and the selected node (`selectedNode`).
*   **Event Bus:** The store is an `EventTarget`. When its state changes, it dispatches a `state-change` event.
*   **Global Access:** It is exported as a singleton instance, `store`, which can be imported into any component or service.

**How it works:**

1.  A component calls a method on the store (e.g., `store.setModal('search')`).
2.  The method calls `this.update({ modal: 'search' })`.
3.  The `update` method merges the new state and dispatches the `state-change` event.
4.  All components listening for this event will re-render themselves with the new state.

```javascript
// src/store.js - Simplified
class Store extends EventTarget {
    constructor() {
        this.state = { /* ... initial state ... */ };
    }

    update(partialState) {
        this.state = { ...this.state, ...partialState };
        this.dispatchEvent(new CustomEvent('state-change', { detail: this.value }));
    }

    setModal(modal) {
        this.update({ modal });
    }
}

export const store = new Store();
```

### 2. Services (`src/services/`)

Services encapsulate specific domains of logic. They are typically classes or objects that handle one thing well.

*   `github.js`: Manages all interactions with the GitHub API (reading files, creating PRs).
*   `ai.js`: Handles communication with AI providers (Puter.com, Ollama).
*   `filesystem.js`: The most important service. It's an **abstraction layer** that decides whether to talk to the `github` service (for remote trees) or the `user-store` (for local trees). Components should **always** use `fileSystem.js` to read or write data, as it keeps them decoupled from the data source.

Services can import and call the `store` if they need to access state or trigger updates.

### 3. Components (`src/components/`)

All UI elements are **native Web Components** (extending `HTMLElement`).

*   **Self-Contained:** Each component manages its own HTML structure and event listeners.
*   **Reactive:** They connect to the global `store` in their `connectedCallback` and listen for the `state-change` event to re-render.
*   **Action Dispatchers:** User interactions (like button clicks) within a component call methods on the global `store` to trigger state changes (e.g., `store.toggleTheme()`).

---

## 🛠️ How to Create a New Component

Let's create a simple "Hello World" component.

**Step 1: Create the file `src/components/hello-world.js`**

```javascript
// 1. Import the global store
import { store } from '../store.js';

// 2. Define the component class, extending HTMLElement
class HelloWorld extends HTMLElement {

    // 3. The connectedCallback is called when the element is added to the DOM
    connectedCallback() {
        // Initial render
        this.render();

        // Listen for state changes from the store to re-render
        store.addEventListener('state-change', () => this.render());
    }

    // 4. The render method builds the component's HTML
    render() {
        // Get data from the store
        const { username } = store.value.gamification;
        const ui = store.ui; // Localized strings

        // Use innerHTML to define the component's view
        this.innerHTML = `
            <div class="p-4 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <p>Hello, ${username || 'Traveler'}!</p>
                <button id="my-button" class="font-bold">${ui.close}</button>
            </div>
        `;

        // 5. Add event listeners after rendering
        this.querySelector('#my-button').onclick = () => {
            // Call a store method to change the state
            alert('Button clicked!');
        };
    }
}

// 6. Register the custom element with a tag name
customElements.define('hello-world', HelloWorld);
```

**Step 2: Import the component in `src/main.js`**

Add this line to `src/main.js` to make the component available to the application.

```javascript
// src/main.js
import './components/hello-world.js';
// ... other imports
```

**Step 3: Use the component in `index.html`**

You can now use your component like any other HTML tag.

```html
<!-- index.html -->
<body>
    <div id="app">
        <!-- ... other components ... -->
        <hello-world></hello-world>
    </div>
</body>
```

That's it! Your component is now live, reactive, and integrated into the app.

## 🎨 Styling

*   **Tailwind CSS:** All styling is done with Tailwind CSS classes, loaded via CDN in `index.html`.
*   **Global Styles:** A few global styles and animations are defined in the `<style>` tag in `index.html`.
*   **Dark Mode:** The `dark` class is toggled on the `<html>` element by the store. Use Tailwind's `dark:` prefixes for dark mode styles (e.g., `bg-white dark:bg-slate-900`).

## 🤝 Submission Process

1.  Fork the [Arbor UI repository](https://github.com/treesys-org/arbor-ui).
2.  Make your changes on a new branch.
3.  Submit a Pull Request to the `main` branch of the original repository.

We look forward to seeing your contributions!