(() => {
  const storageKey = 'sama-design-catalog-images-v1';

  function applyCatalogImages() {
    let overrides = {};
    try {
      overrides = JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
      overrides = {};
    }

    document.querySelectorAll('[data-image-key]').forEach((image) => {
      const override = overrides[image.dataset.imageKey];
      if (typeof override === 'string' && override.startsWith('data:image/')) {
        image.src = override;
      } else if (typeof override === 'string' && /^https?:\/\//i.test(override)) {
        image.src = override;
      }
    });
  }

  applyCatalogImages();
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) applyCatalogImages();
  });
})();
