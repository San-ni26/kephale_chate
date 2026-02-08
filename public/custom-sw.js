// This file is kept for backward compatibility.
// The main service worker is now sw.js
// If loaded via importScripts, the handlers are already in sw.js
// If loaded directly, redirect to sw.js handlers

if (typeof self !== 'undefined' && !self.__swLoaded) {
    self.__swLoaded = true;
    try { importScripts('/sw.js'); } catch(e) { /* already loaded */ }
}
