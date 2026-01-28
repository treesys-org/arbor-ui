// preload.js

// All the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
// For now, we don't need to expose anything to the renderer process (our web app),
// but this file is kept for security best practices and future use.
window.addEventListener('DOMContentLoaded', () => {
  // You can expose specific Node.js functionality to your web app here
  // in a secure way if needed in the future.
  // Example:
  // const { contextBridge } = require('electron');
  // contextBridge.exposeInMainWorld('myAPI', {
  //   doSomething: () => { /* ... */ }
  // });
});
