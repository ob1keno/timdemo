(() => {
  "use strict";

  const products = Array.isArray(window.TIMKUSH_PRODUCTS) ? window.TIMKUSH_PRODUCTS : [];
  const PAGE_SIZE = 24;
  const PHONE = "79896653645";

  const state = {
    category: "",
    collections: new Set(),
    query: "",
    sort: "default",
    limit: PAGE_SIZE,
    currentProduct: null,
    selection: loadSelection(),
  };

  const byId = new Map(products.map((product) => [product.id, product]));
  const specificationLabels = {
    voltage: "Напряжение",
    power: "Мощность",
    dimensions: "Габариты",
    upholstery: "Обивка",
    maxLoad: "Максимальная нагрузка",
    motors: "Количество моторов",
    weight: "Вес нетто / брутто",
    netWeight: "Вес нетто",
    grossWeight: "Вес брутто",
    packingSize: "Размер упаковки",
    color: "Цвета",
    material: "Материал",
    heightRange: "Диапазон высоты",
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadSelection() {
    try {
      const value = JSON.parse(localStorage.getItem("timkush-selection") || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveSelection() {
    localStorage.setItem("timkush-selection", JSON.stringify(state.selection));
    renderSelection();
  }

  function whatsappUrl(message) {
    return `https://wa.me/${PHONE}?text=${encodeURIComponent(message)}`;
  }

  function cardTemplate(product) {
    return `
      <article class="bg-white rounded-2xl overflow-hidden group hover:shadow-lg transition">
        <a href="#product?id=${encodeURIComponent(product.id)}" class="block">
          <div class="relative aspect-square overflow-hidden bg-neutral-100">
            <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy"
              class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
            <span class="absolute top-3 left-3 bg-black text-white text-[10px] px-2 py-1 rounded-full">${escapeHtml(product.collection.replace("Коллекция ", ""))}</span>
          </div>
          <div class="p-4">
            <div class="text-xs text-neutral-500 mb-1">${escapeHtml(product.category)} · наличие уточняется</div>
            <div class="font-medium mb-2 min-h-12">${escapeHtml(product.name)}</div>
            <div class="text-lg font-semibold mb-3">Цена по запросу</div>
          </div>
        </a>
        <div class="px-4 pb-4 -mt-1">
          <button type="button" data-select="${escapeHtml(product.id)}"
            class="w-full bg-black text-white text-sm py-2.5 rounded-full text-center hover:bg-neutral-800">
            ${state.selection.includes(product.id) ? "В подборке ✓" : "Добавить в подборку"}
          </button>
        </div>
      </article>`;
  }

  function renderFilters() {
    const root = $("#catalogFilters");
    if (!root) return;

    const categories = countBy("category");
    const collections = countBy("collection");
    root.innerHTML = `
      <div>
        <div class="font-medium mb-3">Категория</div>
        <div class="space-y-2 text-neutral-600">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="catalog-category" value="" class="accent-black" ${!state.category ? "checked" : ""}>
            Все товары <span class="text-neutral-400 text-xs ml-auto">${products.length}</span>
          </label>
          ${categories.map(([name, count]) => `
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="catalog-category" value="${escapeHtml(name)}" class="accent-black" ${state.category === name ? "checked" : ""}>
              ${escapeHtml(name)} <span class="text-neutral-400 text-xs ml-auto">${count}</span>
            </label>`).join("")}
        </div>
      </div>
      <div>
        <div class="font-medium mb-3">Коллекция</div>
        <div class="space-y-2 text-neutral-600">
          ${collections.map(([name, count]) => `
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" data-collection="${escapeHtml(name)}" class="accent-black" ${state.collections.has(name) ? "checked" : ""}>
              ${escapeHtml(name.replace("Коллекция ", ""))} <span class="text-neutral-400 text-xs ml-auto">${count}</span>
            </label>`).join("")}
        </div>
      </div>
      <button id="resetFilters" type="button" class="text-neutral-500 underline text-xs hover:text-black">Сбросить фильтры</button>`;

    $$('input[name="catalog-category"]', root).forEach((input) => {
      input.addEventListener("change", () => {
        state.category = input.value;
        state.limit = PAGE_SIZE;
        updateCatalogHash();
      });
    });

    $$("[data-collection]", root).forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) state.collections.add(input.dataset.collection);
        else state.collections.delete(input.dataset.collection);
        state.limit = PAGE_SIZE;
        renderCatalog();
      });
    });

    $("#resetFilters", root)?.addEventListener("click", () => {
      state.category = "";
      state.collections.clear();
      state.query = "";
      state.limit = PAGE_SIZE;
      const search = $("#siteSearch");
      if (search) search.value = "";
      history.replaceState(null, "", "#category");
      renderFilters();
      renderCatalog();
    });
  }

  function countBy(key) {
    const counts = new Map();
    products.forEach((product) => counts.set(product[key], (counts.get(product[key]) || 0) + 1));
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }

  function filteredProducts() {
    const query = state.query.trim().toLocaleLowerCase("ru");
    const result = products.filter((product) => {
      const categoryMatches = !state.category || product.category === state.category;
      const collectionMatches = !state.collections.size || state.collections.has(product.collection);
      const haystack = `${product.name} ${product.sku} ${product.category} ${product.collection} ${JSON.stringify(product.specifications || {})}`.toLocaleLowerCase("ru");
      return categoryMatches && collectionMatches && (!query || haystack.includes(query));
    });

    if (state.sort === "name") result.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    if (state.sort === "collection") result.sort((a, b) => a.collection.localeCompare(b.collection, "ru"));
    return result;
  }

  function renderCatalog() {
    const grid = $("#catalogGrid");
    if (!grid) return;
    const filtered = filteredProducts();
    const visible = filtered.slice(0, state.limit);

    grid.innerHTML = visible.length
      ? visible.map(cardTemplate).join("")
      : `<div class="col-span-full border border-neutral-200 rounded-2xl p-12 text-center">
          <h2 class="text-2xl font-semibold mb-2">Ничего не найдено</h2>
          <p class="text-neutral-500 text-sm">Измените запрос или сбросьте фильтры.</p>
        </div>`;

    $("#catalogVisibleCount").textContent = visible.length;
    $("#catalogTotalCount").textContent = filtered.length;
    $("#catalogSubtitle").textContent = `${filtered.length} моделей из актуальных каталогов · в наличии и под заказ из Китая`;
    $("#catalogTitle").textContent = state.category || "Каталог мебели и оборудования";
    $("#catalogBreadcrumb").textContent = state.category || "Все товары";

    const more = $("#showAllProducts");
    more.hidden = visible.length >= filtered.length;
    more.textContent = `Показать ещё (${Math.min(PAGE_SIZE, filtered.length - visible.length)})`;

    const active = $("#activeFilters");
    const chips = [
      state.category,
      ...state.collections,
      state.query ? `Поиск: ${state.query}` : "",
    ].filter(Boolean);
    active.innerHTML = chips.map((text) => `
      <span class="inline-flex items-center bg-neutral-900 text-white text-xs px-3 py-1.5 rounded-full">${escapeHtml(text)}</span>
    `).join("");
  }

  function updateCatalogHash() {
    const params = new URLSearchParams();
    if (state.category) params.set("category", state.category);
    location.hash = `category${params.size ? `?${params}` : ""}`;
  }

  function renderProduct(product) {
    if (!product) return;
    state.currentProduct = product;
    $("#mainImg").src = product.image;
    $("#mainImg").alt = product.name;
    $("#productName").textContent = product.name;
    $("#productBreadcrumb").textContent = product.name;
    $("#productSku").textContent = `Артикул: ${product.sku}`;
    $("#productAvailability").textContent = product.availability;
    $("#productCollection").textContent = product.collection;
    const extractedSpecs = Object.entries(product.specifications || {}).filter(([, value]) => value);
    const summary = extractedSpecs
      .slice(0, 4)
      .map(([key, value]) => `${specificationLabels[key] || key.toLowerCase()}: ${value}`)
      .join("; ");
    $("#productDescription").innerHTML = `
      <p>${escapeHtml(product.description)}</p>
      ${summary ? `<p>По данным каталога: ${escapeHtml(summary)}.</p>` : ""}
      <p>Перед заказом менеджер подтвердит характеристики, комплектацию, стоимость и срок поставки. Гарантия — 24 месяца.</p>`;
    $("#productSpecs").innerHTML = [
      ["Категория", product.category],
      ["Коллекция", product.collection],
      ...extractedSpecs.map(([key, value]) => [specificationLabels[key] || key, value]),
      ["Поставка", "Наличие / под заказ"],
      ["Гарантия", "24 месяца"],
    ].map(([label, value]) => `
      <div class="flex justify-between gap-6 py-2 border-b border-neutral-100">
        <dt class="text-neutral-500">${escapeHtml(label)}</dt>
        <dd class="text-right">${escapeHtml(value)}</dd>
      </div>`).join("");

    const related = products
      .filter((item) => item.collection === product.collection && item.id !== product.id)
      .slice(0, 3);
    $("#productThumbnails").innerHTML = [
      `<button class="aspect-square rounded-xl overflow-hidden border-2 border-black"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" class="w-full h-full object-cover"></button>`,
      ...related.map((item) => `
        <a href="#product?id=${encodeURIComponent(item.id)}" class="aspect-square rounded-xl overflow-hidden border border-neutral-200 hover:border-neutral-400">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="w-full h-full object-cover">
        </a>`),
    ].join("");

    $("#similarProducts").innerHTML = related.concat(
      products.filter((item) => item.category === product.category && item.id !== product.id && !related.includes(item)).slice(0, 4 - related.length)
    ).slice(0, 4).map((item) => `
      <a href="#product?id=${encodeURIComponent(item.id)}" class="group block">
        <div class="aspect-square rounded-2xl overflow-hidden bg-neutral-100 mb-3">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition">
        </div>
        <div class="font-medium text-sm">${escapeHtml(item.name)}</div>
        <div class="text-neutral-500 text-sm">Цена по запросу</div>
      </a>`).join("");

    const message = `Здравствуйте! Интересует ${product.name}, артикул ${product.sku}. Хочу получить актуальный расчёт.`;
    $("#productWhatsapp").href = whatsappUrl(message);
    $("#productRequest").onclick = () => window.open(whatsappUrl(message), "_blank", "noopener");
    $("#productSelect").textContent = state.selection.includes(product.id) ? "В подборке ✓" : "Добавить в подборку";
    $("#productSelect").onclick = () => toggleSelection(product.id);
    document.title = `${product.name} — купить | Timkush`;
  }

  function toggleSelection(id) {
    if (state.selection.includes(id)) state.selection = state.selection.filter((item) => item !== id);
    else state.selection.push(id);
    saveSelection();
    if (state.currentProduct?.id === id) {
      $("#productSelect").textContent = state.selection.includes(id) ? "В подборке ✓" : "Добавить в подборку";
    }
    if ($('[data-page="category"].active')) renderCatalog();
  }

  function renderSelection() {
    const selected = state.selection.map((id) => byId.get(id)).filter(Boolean);
    $("#selectionCount").textContent = selected.length;
    $("#selectionItems").innerHTML = selected.length
      ? selected.map((product) => `
        <div class="grid grid-cols-[72px_1fr_auto] gap-3 items-center py-3 border-b border-neutral-100">
          <img src="${escapeHtml(product.image)}" alt="" class="w-[72px] h-[72px] object-cover rounded-xl">
          <div><div class="text-sm font-medium">${escapeHtml(product.name)}</div><div class="text-xs text-neutral-500 mt-1">${escapeHtml(product.sku)}</div></div>
          <button type="button" data-remove="${escapeHtml(product.id)}" class="text-neutral-400 text-xl">×</button>
        </div>`).join("")
      : `<div class="py-16 text-center text-neutral-500 text-sm">Добавляйте товары из каталога,<br>чтобы запросить общий расчёт.</div>`;

    const list = selected.map((product) => `• ${product.name} (${product.sku})`).join("\n");
    $("#selectionRequest").href = whatsappUrl(`Здравствуйте! Хочу получить общий расчёт по подборке:\n${list}`);
  }

  function openSelection(open) {
    $("#selectionDrawer").classList.toggle("translate-x-full", !open);
    $("#selectionOverlay").classList.toggle("hidden", !open);
    document.body.classList.toggle("overflow-hidden", open);
  }

  function route() {
    const raw = location.hash.slice(1) || "home";
    const [path, queryString = ""] = raw.split("?");
    const page = path === "lead" ? "home" : ["home", "category", "product", "showroom"].includes(path) ? path : "home";

    $$("[data-page]").forEach((element) => element.classList.toggle("active", element.dataset.page === page));
    const params = new URLSearchParams(queryString);

    if (page === "category") {
      state.category = params.get("category") || "";
      state.limit = PAGE_SIZE;
      renderFilters();
      renderCatalog();
      document.title = `${state.category || "Каталог мебели и оборудования"} | Timkush`;
    }

    if (page === "product") {
      renderProduct(byId.get(params.get("id")) || products[0]);
    }

    if (path === "lead") {
      requestAnimationFrame(() => $("#lead")?.scrollIntoView({ behavior: "smooth" }));
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }

  $("#showAllProducts")?.addEventListener("click", () => {
    state.limit += PAGE_SIZE;
    renderCatalog();
  });
  $("#catalogSort")?.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderCatalog();
  });
  $("#siteSearch")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    state.query = event.target.value.trim();
    state.category = "";
    state.collections.clear();
    state.limit = PAGE_SIZE;
    if (!location.hash.startsWith("#category")) location.hash = "category";
    else {
      renderFilters();
      renderCatalog();
    }
  });

  document.addEventListener("click", (event) => {
    const select = event.target.closest("[data-select]");
    if (select) toggleSelection(select.dataset.select);
    const remove = event.target.closest("[data-remove]");
    if (remove) toggleSelection(remove.dataset.remove);
  });

  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = [...form.querySelectorAll("input")]
        .map((input) => `${input.placeholder}: ${input.value.trim()}`)
        .filter((value) => !value.endsWith(": "));
      window.open(whatsappUrl(["Здравствуйте! Заявка с сайта Timkush.", ...values].join("\n")), "_blank", "noopener");
    });
  });

  $("#selectionButton")?.addEventListener("click", () => openSelection(true));
  $("#selectionClose")?.addEventListener("click", () => openSelection(false));
  $("#selectionOverlay")?.addEventListener("click", () => openSelection(false));
  $(".md\\:hidden.border")?.addEventListener("click", () => {
    const aside = $("#catalogFilters")?.closest("aside");
    aside?.classList.toggle("hidden");
  });

  window.addEventListener("hashchange", route);
  renderSelection();
  route();
})();
