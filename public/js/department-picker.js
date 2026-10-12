(() => {
  const selects = document.querySelectorAll(".js-department-picker");

  selects.forEach((select, pickerIndex) => {
    if (!(select instanceof HTMLSelectElement) || select.dataset.enhanced === "true") return;

    const isMultiple = select.multiple;
    const options = Array.from(select.options).filter((option) => option.value);
    const placeholder = select.dataset.placeholder || (isMultiple ? "Choose departments" : "Select department");
    const wrapper = document.createElement("div");
    const trigger = document.createElement("button");
    const panel = document.createElement("div");
    const search = document.createElement("input");
    const actions = document.createElement("div");
    const list = document.createElement("div");
    const empty = document.createElement("p");
    const listId = `${select.id || `department-picker-${pickerIndex}`}-listbox`;

    wrapper.className = "department-picker";
    trigger.type = "button";
    trigger.className = "department-picker__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", listId);
    panel.className = "department-picker__panel";
    panel.hidden = true;
    search.type = "search";
    search.className = "department-picker__search";
    search.placeholder = select.dataset.searchPlaceholder || "Search departments";
    search.autocomplete = "off";
    search.setAttribute("role", "combobox");
    search.setAttribute("aria-autocomplete", "list");
    search.setAttribute("aria-expanded", "false");
    search.setAttribute("aria-controls", listId);
    actions.className = "multi-choice-actions department-picker__actions";
    list.id = listId;
    list.className = "department-picker__options";
    list.setAttribute("role", "listbox");
    if (isMultiple) list.setAttribute("aria-multiselectable", "true");
    empty.className = "department-picker__empty";
    empty.textContent = "No departments found. Try another search or use the department suggestion option where available.";
    empty.hidden = true;

    let activeIndex = -1;
    const optionButtons = options.map((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "department-picker__option";
      button.id = `${listId}-option-${index}`;
      button.dataset.value = option.value;
      button.dataset.search = option.textContent.trim().toLocaleLowerCase();
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", option.selected ? "true" : "false");
      button.tabIndex = -1;
      const label = document.createElement("span");
      const check = document.createElement("span");
      label.textContent = option.textContent.trim();
      check.className = "department-picker__check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";
      button.append(label, check);
      list.append(button);
      return button;
    });

    const visibleButtons = () => optionButtons.filter((button) => !button.hidden);

    const updateTrigger = () => {
      const selected = options.filter((option) => option.selected);
      if (!selected.length) {
        trigger.textContent = placeholder;
        trigger.classList.add("is-placeholder");
      } else if (!isMultiple || selected.length === 1) {
        trigger.textContent = selected[0].textContent.trim();
        trigger.classList.remove("is-placeholder");
      } else {
        trigger.textContent = `${selected.length} departments selected`;
        trigger.classList.remove("is-placeholder");
      }
      optionButtons.forEach((button) => {
        const option = options.find((item) => item.value === button.dataset.value);
        button.setAttribute("aria-selected", option && option.selected ? "true" : "false");
      });
    };

    const setActive = (nextIndex) => {
      const visible = visibleButtons();
      if (!visible.length) return;
      activeIndex = Math.max(0, Math.min(nextIndex, visible.length - 1));
      optionButtons.forEach((button) => button.classList.remove("is-active"));
      const active = visible[activeIndex];
      active.classList.add("is-active");
      search.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    };

    const filterOptions = () => {
      const query = search.value.trim().toLocaleLowerCase();
      optionButtons.forEach((button) => {
        button.hidden = !button.dataset.search.includes(query);
      });
      empty.hidden = visibleButtons().length > 0;
      activeIndex = -1;
      search.removeAttribute("aria-activedescendant");
    };

    const close = ({ focusTrigger = false } = {}) => {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      search.setAttribute("aria-expanded", "false");
      wrapper.classList.remove("is-open");
      activeIndex = -1;
      search.removeAttribute("aria-activedescendant");
      if (focusTrigger) trigger.focus();
    };

    const open = () => {
      document.querySelectorAll(".department-picker.is-open").forEach((openPicker) => {
        if (openPicker !== wrapper) openPicker.querySelector(".department-picker__trigger")?.click();
      });
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      search.setAttribute("aria-expanded", "true");
      wrapper.classList.add("is-open");
      search.value = "";
      filterOptions();
      search.focus();
    };

    const choose = (button) => {
      const option = options.find((item) => item.value === button.dataset.value);
      if (!option) return;
      if (isMultiple) option.selected = !option.selected;
      else {
        options.forEach((item) => { item.selected = item === option; });
        close({ focusTrigger: true });
      }
      select.dispatchEvent(new Event("change", { bubbles: true }));
      updateTrigger();
    };

    if (isMultiple) {
      const selectAll = document.createElement("button");
      const clearAll = document.createElement("button");
      selectAll.type = "button";
      clearAll.type = "button";
      selectAll.textContent = "Select all";
      clearAll.textContent = "Clear";
      selectAll.addEventListener("click", () => {
        options.forEach((option) => { option.selected = true; });
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      clearAll.addEventListener("click", () => {
        options.forEach((option) => { option.selected = false; });
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      actions.append(selectAll, clearAll);
    }

    trigger.addEventListener("click", () => panel.hidden ? open() : close());
    trigger.addEventListener("keydown", (event) => {
      if (["ArrowDown", "Enter", " "].includes(event.key) && panel.hidden) {
        event.preventDefault();
        open();
      }
    });
    search.addEventListener("input", filterOptions);
    search.addEventListener("keydown", (event) => {
      const visible = visibleButtons();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive(activeIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive(activeIndex < 0 ? visible.length - 1 : activeIndex - 1);
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        choose(visible[activeIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        close({ focusTrigger: true });
      }
    });
    list.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest(".department-picker__option");
      if (button) choose(button);
    });
    document.addEventListener("click", (event) => {
      if (!panel.hidden && !wrapper.contains(event.target)) close();
    });
    select.addEventListener("change", updateTrigger);
    select.form?.addEventListener("reset", () => window.setTimeout(updateTrigger));

    if (isMultiple) panel.append(actions);
    panel.append(search, list, empty);
    select.insertAdjacentElement("afterend", wrapper);
    wrapper.append(trigger, panel);
    select.dataset.enhanced = "true";
    select.tabIndex = -1;
    updateTrigger();
  });

  document.querySelectorAll("[data-checklist-actions]").forEach((controls) => {
    const name = controls.getAttribute("data-checklist-actions");
    const form = controls.closest("form");
    if (!name || !form) return;
    const checkboxes = () => Array.from(form.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`));
    controls.querySelector("[data-select-all]")?.addEventListener("click", () => {
      checkboxes().forEach((checkbox) => { checkbox.checked = true; });
      checkboxes()[0]?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    controls.querySelector("[data-clear-all]")?.addEventListener("click", () => {
      checkboxes().forEach((checkbox) => { checkbox.checked = false; });
      checkboxes()[0]?.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
})();
