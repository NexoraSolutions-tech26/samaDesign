(() => {
  const storageKey = 'sama-design-catalog-images-v1';
  const items = [
    { key: 'kitchen-1', title: 'مطبخ بخطوط هادئة', category: 'المطابخ' },
    { key: 'table-1', title: 'طاولة تجمع الأحبة', category: 'الطاولات' },
    { key: 'wardrobe-1', title: 'خزانة بتفاصيل ذكية', category: 'الخزائن' },
    { key: 'wall-1', title: 'جدار بلمسة خشب', category: 'الديكورات' },
    { key: 'kitchen-2', title: 'مطبخ يليق ببيتك', category: 'المطابخ' },
    { key: 'table-2', title: 'طاولة بتوقيعك', category: 'الطاولات' },
    { key: 'wardrobe-2', title: 'خزانة مصمّمة لمساحتك', category: 'الخزائن' },
    { key: 'living-1', title: 'تفاصيل تصنع الفرق', category: 'الديكورات' }
  ];
  const grid = document.getElementById('admin-grid');
  const status = document.getElementById('save-status');
  let defaults = {};
  let overrides = {};

  function readOverrides() {
    try {
      overrides = JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
      overrides = {};
    }
  }

  function saveOverrides(message) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(overrides));
      status.textContent = message;
      return true;
    } catch {
      status.textContent = 'لم يتم الحفظ. مساحة التخزين في المتصفح ممتلئة؛ جرّب صورة أصغر.';
      return false;
    }
  }

  function currentImage(item) {
    return overrides[item.key] || defaults[item.key] || '';
  }

  function render() {
    grid.replaceChildren();
    items.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'overflow-hidden border border-black/10 bg-white';
      card.innerHTML = `
        <div class="image-preview overflow-hidden bg-[#e5e0d7]"><img class="h-full w-full object-cover" alt="${item.title}" data-preview="${item.key}"></div>
        <div class="p-4">
          <div class="flex items-start justify-between gap-3">
            <div><h2 class="font-semibold">${item.title}</h2><p class="mt-1 text-xs text-black/55">${item.category}</p></div>
            <button type="button" class="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-black/10 text-[#875d3b] transition hover:bg-[#f7f4ee]" data-action="reset-one" data-key="${item.key}" aria-label="استعادة الصورة الأصلية: ${item.title}" title="استعادة الصورة الأصلية"><i data-lucide="rotate-ccw" class="h-4 w-4" aria-hidden="true"></i></button>
          </div>
          <label class="mt-4 block text-xs font-medium" for="url-${item.key}">رابط الصورة</label>
          <div class="mt-1 flex gap-2"><input id="url-${item.key}" data-role="url" data-key="${item.key}" type="url" dir="ltr" placeholder="https://…" class="min-w-0 flex-1 border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[#875d3b]"><button type="button" data-action="save-url" data-key="${item.key}" class="shrink-0 bg-[#282923] px-3 text-sm font-medium text-white transition hover:bg-[#875d3b]">حفظ الرابط</button></div>
          <label class="mt-3 flex min-h-10 cursor-pointer items-center justify-center gap-2 border border-dashed border-black/20 px-3 text-sm transition hover:border-[#875d3b] hover:bg-[#f7f4ee]"><i data-lucide="image-plus" class="h-4 w-4" aria-hidden="true"></i> اختيار صورة من الجهاز<input type="file" accept="image/jpeg,image/png,image/webp" data-role="file" data-key="${item.key}" class="sr-only"></label>
        </div>`;
      grid.append(card);
      const image = card.querySelector(`[data-preview="${item.key}"]`);
      image.src = currentImage(item);
      image.onerror = () => { status.textContent = `تعذر تحميل صورة «${item.title}». تحقق من الرابط أو اختر ملفاً آخر.`; };
      const urlInput = card.querySelector('[data-role="url"]');
      if (!currentImage(item).startsWith('data:image/')) urlInput.value = overrides[item.key] || '';
      else urlInput.placeholder = 'صورة مرفوعة ومحفوظة محلياً';
    });
    if (window.lucide) window.lucide.createIcons();
  }

  function loadDefaults() {
    fetch('./index.html', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('تعذر تحميل المعرض');
        return response.text();
      })
      .then((html) => {
        const documentCopy = new DOMParser().parseFromString(html, 'text/html');
        documentCopy.querySelectorAll('[data-image-key]').forEach((image) => {
          defaults[image.dataset.imageKey] = image.getAttribute('src');
        });
        readOverrides();
        render();
        status.textContent = 'التغييرات تُحفظ تلقائياً في هذا المتصفح.';
      })
      .catch(() => {
        status.textContent = 'تعذر تحميل الصور الأصلية. افتح الصفحة عبر خادم محلي أو موقع منشور.';
      });
  }

  function imageToDataUrl(file) {
    return createImageBitmap(file).then((bitmap) => {
      const maxSize = 1400;
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return canvas.toDataURL('image/webp', 0.78);
    });
  }

  grid.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const item = items.find((entry) => entry.key === button.dataset.key);
    if (!item) return;

    if (button.dataset.action === 'reset-one') {
      delete overrides[item.key];
      if (saveOverrides(`تمت استعادة صورة «${item.title}».`)) render();
      return;
    }

    const field = grid.querySelector(`[data-role="url"][data-key="${item.key}"]`);
    const value = field.value.trim();
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('رابط غير صالح');
      const testImage = new Image();
      testImage.onload = () => {
        overrides[item.key] = url.href;
        if (saveOverrides(`تم حفظ صورة «${item.title}».`)) render();
      };
      testImage.onerror = () => { status.textContent = 'تعذر فتح الصورة من هذا الرابط. جرّب رابط صورة مباشر.'; };
      testImage.src = url.href;
    } catch {
      status.textContent = 'أدخل رابط صورة صحيحاً يبدأ بـ https:// أو http://.';
    }
  });

  grid.addEventListener('change', async (event) => {
    const input = event.target;
    if (input.dataset.role !== 'file' || !input.files?.[0]) return;
    const item = items.find((entry) => entry.key === input.dataset.key);
    if (!item) return;
    status.textContent = 'جاري تجهيز الصورة…';
    try {
      overrides[item.key] = await imageToDataUrl(input.files[0]);
      if (saveOverrides(`تم حفظ صورة «${item.title}» في هذا المتصفح.`)) render();
    } catch {
      status.textContent = 'تعذر تجهيز الصورة. استخدم ملف JPG أو PNG أو WebP.';
    }
  });

  document.getElementById('reset-all').addEventListener('click', () => {
    overrides = {};
    if (saveOverrides('تمت استعادة الصور الأصلية.')) render();
  });

  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) {
      readOverrides();
      render();
    }
  });

  loadDefaults();
})();
