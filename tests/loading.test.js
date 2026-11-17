import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const source = await readFile('src/views/assets/shared/loading.js', 'utf8');
function setup() {
  class Element {
    constructor(tag = 'BUTTON') {
      this.tagName = tag; this.attrs = new Map(); this.children = []; this.disabled = false;
      this.classes = new Set(); this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
      this.method = 'post'; this.target = ''; this.parentElement = null;
    }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    setAttribute(name, value) { this.attrs.set(name, value); }
    removeAttribute(name) { this.attrs.delete(name); }
    hasAttribute(name) { return this.attrs.has(name); }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
    querySelector() { return this.children.find(child => child.tagName === 'BUTTON'); }
    closest(selector) {
      if (selector.startsWith('.')) return this.classes.has(selector.slice(1)) ? this : null;
      if (selector === 'a[data-loading-download]') return this.tagName === 'A' && this.hasAttribute('data-loading-download') ? this : null;
      if (selector === 'a[href]') return this.tagName === 'A' ? this : null;
      return ['BUTTON', 'INPUT', 'A'].includes(this.tagName) ? this : this.parentElement;
    }
  }
  const events = [], page = new Map();
  const document = { createElement: tag => new Element(tag.toUpperCase()), addEventListener: (type, handler, capture = false) => events.push({ type, handler, capture }) };
  const window = { addEventListener: (type, handler) => page.set(type, handler) };
  vm.runInNewContext(source, { window, document, queueMicrotask, URL, location: new URL('https://example.invalid/current') });
  function event(target, type = 'click', extra = {}) {
    return { target, type, button: 0, currentTarget: target, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
  }
  function dispatch(type, e) {
    for (const capture of [true, false]) for (const listener of events.filter(l => l.type === type && l.capture === capture)) {
      if (e.stopped) return; listener.handler(e);
    }
  }
  return { Element, event, dispatch, page, loading: window.FitnexisLoading };
}

test('async actions stay busy until completion, block duplicates and preserve button contents', async () => {
  const { Element, event, loading, dispatch } = setup();
  const button = new Element(), icon = button.appendChild(new Element('I'));
  button.setAttribute('aria-disabled', 'false');
  let release, calls = 0;
  const wait = new Promise(resolve => { release = resolve; });
  const action = loading.wrap(async () => { calls++; assert.equal(button.getAttribute('aria-busy'), null); await wait; });
  const pending = action(event(button));
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(button.children[0], icon);
  assert.equal(button.children.length, 2);
  const duplicate = event(button); action(duplicate);
  assert.equal(calls, 1); assert.equal(duplicate.defaultPrevented, true);
  const delegatedDuplicate = event(button); dispatch('click', delegatedDuplicate);
  assert.equal(delegatedDuplicate.stopped, true);
  release(); await pending;
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(button.getAttribute('aria-disabled'), 'false');
  assert.deepEqual(button.children, [icon]);
});

test('native submit keeps named submitters available, locks the form and resets on browser Back', async () => {
  const { Element, event, dispatch, page } = setup();
  const form = new Element('FORM'), button = form.appendChild(new Element());
  button.name = 'decision'; button.value = 'approved';
  dispatch('submit', event(form, 'submit', { submitter: button }));
  await Promise.resolve();
  assert.equal(button.disabled, false, 'Disabling a native submitter would remove its name/value');
  assert.equal(button.value, 'approved');
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(form.getAttribute('aria-busy'), 'true');
  const duplicate = event(form, 'submit', { submitter: button }); dispatch('submit', duplicate);
  assert.equal(duplicate.defaultPrevented, true);
  page.get('pageshow')();
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(form.getAttribute('aria-busy'), null);
});

test('delegated actions leave unrelated buttons available to their own handlers', async () => {
  const { Element, event, loading } = setup(); const button = new Element();
  const delegated = loading.wrap(async e => {
    if (!e.target.closest('.delete-session')) return;
    throw Error('An unrelated action must not run');
  }, { selector: '.delete-session' });
  const ignored = delegated(event(button));
  assert.equal(button.getAttribute('aria-busy'), null);
  let ran = false;
  await loading.wrap(async () => { ran = true; })(event(button));
  await ignored;
  assert.equal(ran, true);
});

test('prevented submissions and dialog forms stay usable', async () => {
  const { Element, event, dispatch } = setup();
  for (const dialog of [false, true]) {
    const form = new Element('FORM'), button = form.appendChild(new Element());
    if (dialog) form.method = 'dialog';
    const e = event(form, 'submit', { submitter: button });
    dispatch('submit', e);
    if (!dialog) e.preventDefault(); // A later validation or confirmation handler cancelled it.
    await Promise.resolve();
    assert.equal(button.getAttribute('aria-busy'), null);
  }
});

test('network failures restore controls and provide an accessible retry message', async () => {
  const { Element, event, loading } = setup();
  const form = new Element('FORM'), button = form.appendChild(new Element());
  await loading.wrap(async e => { e.preventDefault(); throw Error('private provider error'); })(event(form, 'submit', { submitter: button }));
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(form.getAttribute('aria-busy'), null);
  const message = form.children.at(-1);
  assert.equal(message.getAttribute('role'), 'alert');
  assert.match(message.textContent, /try again/);
  assert.ok(!message.textContent.includes('private'));
});

test('old completion after pageshow cannot clear a newer action and domain disabled states survive', () => {
  const { Element, loading, page } = setup(); const button = new Element();
  const old = loading.start(button); page.get('pageshow')();
  const current = loading.start(button); old();
  assert.equal(button.getAttribute('aria-busy'), 'true');
  button.disabled = true; current();
  assert.equal(button.disabled, true, 'An Enrolled or otherwise unavailable action must stay disabled');
});

test('navigation feedback excludes hash tabs, downloads, external links and modified clicks', async () => {
  const { Element, event, dispatch } = setup();
  for (const [href, extra] of [
    ['https://example.invalid/current#tab', {}], ['https://example.invalid/export.csv', {}],
    ['https://other.invalid/page', {}], ['https://example.invalid/next', { ctrlKey: true }],
  ]) {
    const link = new Element('A'); link.href = href;
    dispatch('click', event(link, 'click', extra)); await Promise.resolve();
    assert.equal(link.getAttribute('aria-busy'), null);
  }
  const link = new Element('A'); link.href = 'https://example.invalid/next';
  dispatch('click', event(link)); await Promise.resolve();
  assert.equal(link.getAttribute('aria-busy'), 'true');
});

test('every page shell includes shared loading assets once', async () => {
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    return (await Promise.all(entries.map(e => e.isDirectory() ? walk(path.join(dir, e.name)) : path.join(dir, e.name)))).flat();
  }
  for (const file of (await walk('src/views')).filter(file => file.endsWith('.html'))) {
    const html = await readFile(file, 'utf8');
    if (!/<head[\s>]/i.test(html)) continue;
    assert.equal(html.split('/assets/shared/loading.js').length - 1, 1, file);
    assert.equal(html.split('/assets/shared/loading.css').length - 1, 1, file);
  }
});
