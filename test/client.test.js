import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');

function loadClient() {
  let entry;
  const window = {
    __ModuleLoader__: {
      load(value) {
        entry = value;
      },
    },
  };
  const React = { createElement: () => null };
  runInNewContext(source, {
    window,
    navigator: { language: 'en-US' },
    require(name) {
      if (name === 'react') return React;
      throw new Error(`unexpected require: ${name}`);
    },
  });
  assert.ok(entry, 'the classic script must register one module');
  const exported = entry.factory((name) => {
    if (name === 'react') return React;
    throw new Error(`unexpected require: ${name}`);
  });
  return { entry, exported };
}

test('the client script registers a settings row and no ESM surface', () => {
  assert.doesNotMatch(source, /^export /m);
  assert.doesNotMatch(source, /^import /m);
  const { entry, exported } = loadClient();
  assert.equal(entry.id, 'dsh-tool-compact-context');
  assert.deepEqual(Array.from(exported.inject), ['slots', 'configForms']);
  assert.equal(typeof exported.apply, 'function');
});


test('the settings form renders the four effective defaults', () => {
  let entry;
  let cursor = 0;
  const states = [];
  const React = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children };
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (next) => {
        states[index] = typeof next === 'function' ? next(states[index]) : next;
      }];
    },
    useEffect(run) {
      const cleanup = run();
      if (typeof cleanup === 'function') cleanup();
    },
  };
  runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(value) {
          entry = value;
        },
      },
    },
    navigator: { language: 'en-US' },
    require(name) {
      if (name === 'react') return React;
      throw new Error(`unexpected require: ${name}`);
    },
  });
  const exported = entry.factory((name) => {
    if (name === 'react') return React;
    throw new Error(`unexpected require: ${name}`);
  });
  const form = {
    getSnapshot() {
      return { status: 'ready', writable: true, revision: 1, value: {} };
    },
    subscribe() {
      return () => {};
    },
    mutate() {
      return Promise.resolve(true);
    },
  };
  cursor = 0;
  const tree = exported.ConfigView({ configForm: form, view: 'page' });
  const inputs = [];
  const textareas = [];
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (node.type === 'input') inputs.push(node);
    if (node.type === 'textarea') textareas.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  assert.equal(inputs.length, 7);
  assert.deepEqual(inputs.slice(0, 4).map((input) => input.props.checked), [true, false, false, false]);
  assert.deepEqual(inputs.slice(4).map((input) => input.props.type), ['number', 'number', 'number']);
  assert.deepEqual(inputs.slice(4).map((input) => input.props.value), ['2', '1', '0']);
  assert.equal(textareas.length, 2);
  assert.equal(textareas[0].props.value, '');
  assert.equal(textareas[1].props.value, '');
});

test('renders timeout and per-model values in seconds', () => {
  let entry;
  let cursor = 0;
  const states = [];
  const React = {
    createElement(type, props, ...children) { return { type, props: props ?? {}, children }; },
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useEffect(run) {
      const cleanup = run();
      if (typeof cleanup === 'function') cleanup();
    },
  };
  runInNewContext(source, {
    window: { __ModuleLoader__: { load(value) { entry = value; } } },
    navigator: { language: 'en-US' },
    require(name) {
      if (name === 'react') return React;
      throw new Error(`unexpected require: ${name}`);
    },
  });
  const exported = entry.factory((name) => {
    if (name === 'react') return React;
    throw new Error(`unexpected require: ${name}`);
  });
  const form = {
    getSnapshot() {
      return {
        status: 'ready', writable: true, revision: 1,
        value: { retryDelayMs: 1500, ptcTimeoutMs: 600000, ptcModelTimeouts: { 'slow/model': 300000 } },
      };
    },
    subscribe() { return () => {}; },
    mutate() { return Promise.resolve(true); },
  };
  cursor = 0;
  const tree = exported.ConfigView({ configForm: form, view: 'page' });
  const inputs = [];
  const textareas = [];
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (node.type === 'input') inputs.push(node);
    if (node.type === 'textarea') textareas.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  assert.deepEqual(inputs.slice(4).map((input) => input.props.value), ['2', '1.5', '600']);
  assert.equal(textareas[0].props.value, 'slow/model = 300');
});

test('the client form registers against the package and row config slots', () => {
  const { exported } = loadClient();
  const registrations = [];
  const form = {
    getSnapshot() {
      return { status: 'ready', writable: true, revision: 1, value: {} };
    },
    subscribe() {
      return () => {};
    },
    mutate() {
      return Promise.resolve(true);
    },
  };
  const ctx = {
    configForms: {
      get(id) {
        assert.equal(id, 'dsh-tool-compact-context');
        return form;
      },
      whileServed(ids, register) {
        assert.deepEqual(Array.from(ids), ['dsh-tool-compact-context']);
        return register();
      },
    },
    slots: {
      inject(name, register) {
        assert.ok(['plugins.row.config', 'plugins.bundle.config'].includes(name), name);
        return register();
      },
      register(definition, view) {
        registrations.push({ definition, view });
        return () => {};
      },
    },
    effect(run) {
      return run();
    },
  };
  exported.apply(ctx);
  assert.equal(registrations.length, 2);
  const row = registrations.find((item) => item.definition.name === 'plugins.row.config');
  const bundle = registrations.find((item) => item.definition.name === 'plugins.bundle.config');
  assert.equal(row.definition.key, 'dsh-tool-compact-context#dsh-tool-compact-context');
  assert.equal(bundle.definition.key, 'dsh-tool-compact-context');
  assert.equal(row.definition.inject().configForm, form);
  assert.equal(bundle.definition.inject().configForm, form);
  assert.equal(typeof row.view, 'function');
  assert.equal(typeof bundle.view, 'function');
});
