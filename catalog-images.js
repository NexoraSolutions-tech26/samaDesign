(() => {
  fetch('/api/catalog-images', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`تعذر تحميل صور الكتالوج (${response.status})`);
      return response.json();
    })
    .then((images) => {
      document.querySelectorAll('[data-image-key]').forEach((image) => {
        const url = images[image.dataset.imageKey];
        if (typeof url === 'string' && /^https:\/\//i.test(url)) image.src = url;
      });
    })
    .catch((error) => console.error(error));
})();
