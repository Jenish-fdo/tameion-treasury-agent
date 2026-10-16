// jsdom has no IntersectionObserver (scroll-linked reveals use it). A no-op stub keeps content in the DOM.
// Imported only by the credential-flow tests: older tests check behaviour when IntersectionObserver is absent.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
Object.assign(globalThis, { IntersectionObserver: NoopIntersectionObserver });
export {};
