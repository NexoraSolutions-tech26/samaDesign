(() => {
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

  async function request(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || `فشلت العملية (${response.status}).`);
    }
    return response.status === 204 ? null : response.json();
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
      urlInput.value = overrides[item.key] || '';
    });
    if (window.lucide) window.lucide.createIcons();
  }

  async function loadDefaults() {
    try {
      const [pageResponse, savedImages] = await Promise.all([
        fetch('./index.html', { cache: 'no-store' }),
        request('/api/catalog-images', { cache: 'no-store' })
      ]);
      if (!pageResponse.ok) throw new Error('تعذر تحميل صور الكتالوج.');
      const html = await pageResponse.text();
      const documentCopy = new DOMParser().parseFromString(html, 'text/html');
      documentCopy.querySelectorAll('[data-image-key]').forEach((image) => {
        defaults[image.dataset.imageKey] = image.getAttribute('src');
      });
      overrides = savedImages;
      render();
      status.textContent = 'التغييرات تُحفظ على الخادم وتظهر لجميع الزوار.';
    } catch (error) {
      status.textContent = error.message || 'تعذر تحميل صور الكتالوج. تحقق من إعداد خدمة التخزين.';
    }
  }

  async function imageToWebp(file) {
    const bitmap = await createImageBitmap(file);
    try {
      const maxSize = 1400;
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('تعذر تجهيز الصورة في هذا المتصفح.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error('تعذر تحويل الصورة.'));
        }, 'image/webp', 0.78);
      });
      if (blob.type !== 'image/webp') throw new Error('تحويل WebP غير مدعوم في هذا المتصفح.');
      return blob;
    } finally {
      bitmap.close();
    }
  }

  grid.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const item = items.find((entry) => entry.key === button.dataset.key);
    if (!item) return;

    if (button.dataset.action === 'reset-one') {
      status.textContent = 'جاري استعادة الصورة الأصلية…';
      try {
        await request(`/admin/catalog-images/${item.key}`, { method: 'DELETE' });
        delete overrides[item.key];
        render();
        status.textContent = `تمت استعادة صورة «${item.title}».`;
      } catch (error) {
        status.textContent = error.message;
      }
      return;
    }

    const field = grid.querySelector(`[data-role="url"][data-key="${item.key}"]`);
    const value = field.value.trim();
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('رابط غير صالح');
      status.textContent = 'جاري حفظ الصورة على الخادم…';
      const savedImage = await request(`/admin/catalog-images/${item.key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.href })
      });
      overrides[item.key] = savedImage.url;
      render();
      status.textContent = `تم حفظ صورة «${item.title}» لجميع الزوار.`;
    } catch (error) {
      status.textContent = error.message || 'أدخل رابط صورة صحيحاً يبدأ بـ https:// أو http://.';
    }
  });

  grid.addEventListener('change', async (event) => {
    const input = event.target;
    if (input.dataset.role !== 'file' || !input.files?.[0]) return;
    const item = items.find((entry) => entry.key === input.dataset.key);
    if (!item) return;
    status.textContent = 'جاري تجهيز الصورة ورفعها…';
    try {
      const image = await imageToWebp(input.files[0]);
      const savedImage = await request(`/admin/catalog-images/${item.key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/webp' },
        body: image
      });
      overrides[item.key] = savedImage.url;
      render();
      status.textContent = `تم رفع صورة «${item.title}» وأصبحت متاحة لجميع الزوار.`;
    } catch (error) {
      status.textContent = error.message || 'تعذر رفع الصورة. استخدم ملف JPG أو PNG أو WebP.';
    }
  });

  document.getElementById('reset-all').addEventListener('click', async () => {
    status.textContent = 'جاري استعادة الصور الأصلية…';
    try {
      await request('/admin/catalog-images/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: items.map((item) => item.key) })
      });
      overrides = {};
      render();
      status.textContent = 'تمت استعادة الصور الأصلية لجميع الزوار.';
    } catch (error) {
      status.textContent = error.message;
    }
  });

  void loadDefaults();
})();
