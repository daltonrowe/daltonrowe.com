// the node graph
//
// calling an effect does not process pixels. it returns a node: a plain
// description of an operation and what feeds it. work happens only when
// render() walks the graph, and each node is evaluated once no matter how
// many others read from it, so branching and recombining is cheap.
//
//   const base = source({ file: "photo.jpg" });
//   const out = blend({ a: blur(base, { radius: 8 }), b: base }, { mode: "screen" });
//
// base appears twice above and is decoded once.

import { assertImage } from "./image.js";

const registry = new Map();

const NODE = Symbol.for("daltonrowe.image.node");

export function isNode(value) {
  return Boolean(value) && value[NODE] === true;
}

// describe an effect once, get a node factory back
//
//   inputs  how many upstream images it reads (0 for generators)
//   params  defaults, and the full list of knobs the node accepts
//   apply   (images, params) -> image, must not mutate anything in images

export function defineEffect(type, spec) {
  if (registry.has(type)) {
    throw new Error(`effect ${JSON.stringify(type)} is already defined`);
  }

  const definition = {
    type,
    inputs: spec.inputs ?? 1,
    inputNames: spec.inputNames,
    params: spec.params ?? {},
    apply: spec.apply,
  };

  registry.set(type, definition);

  // generators take (params), everything else takes (inputs, params), where
  // inputs is a single node for arity 1 and an array or object beyond that
  return function create(a, b) {
    const [inputs, params] = definition.inputs === 0 ? [[], a ?? {}] : [a, b ?? {}];

    return makeNode(type, normaliseInputs(definition, inputs), params);
  };
}

function normaliseInputs(definition, inputs) {
  if (definition.inputs === 0) return [];

  const named = !isNode(inputs) && !Array.isArray(inputs);
  const list = isNode(inputs) ? [inputs] : named ? namedToList(definition, inputs) : inputs;

  if (list.length !== definition.inputs) {
    throw new Error(
      `effect ${JSON.stringify(definition.type)} takes ${definition.inputs} input(s), got ${list.length}`,
    );
  }

  list.forEach((input, index) => {
    if (isNode(input)) return;

    // name the slot, so a typo in { a, b } says which one went missing
    const label = named ? JSON.stringify(inputNames(definition)[index]) : `at index ${index}`;

    throw new Error(
      `effect ${JSON.stringify(definition.type)} needs a node for input ${label}, got ${describeValue(input)}`,
    );
  });

  return list;
}

function describeValue(value) {
  return value === undefined ? "nothing" : JSON.stringify(value) ?? String(value);
}

function inputNames(definition) {
  return definition.inputNames ?? ["a", "b", "c", "d"];
}

// two-input effects read nicer as { a, b } than as a positional array

function namedToList(definition, inputs) {
  if (!inputs || typeof inputs !== "object") {
    throw new Error(`effect ${JSON.stringify(definition.type)} needs its inputs`);
  }

  return inputNames(definition).slice(0, definition.inputs).map((name) => inputs[name]);
}

function makeNode(type, inputs, params) {
  const definition = registry.get(type);

  for (const key of Object.keys(params)) {
    if (!(key in definition.params)) {
      const known = Object.keys(definition.params).join(", ") || "none";
      throw new Error(`effect ${JSON.stringify(type)} has no parameter ${JSON.stringify(key)}, knows: ${known}`);
    }
  }

  return {
    [NODE]: true,
    type,
    inputs,
    params: { ...definition.params, ...params },
  };
}

export function getEffect(type) {
  const definition = registry.get(type);

  if (!definition) {
    throw new Error(`unknown effect ${JSON.stringify(type)}`);
  }

  return definition;
}

export function listEffects() {
  return [...registry.values()]
    .map(({ type, inputs, params }) => ({ type, inputs, params }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

// evaluate the graph
//
// cache is keyed on the node itself, so sharing a node shares its result.
// pass your own cache across several render() calls to reuse decoded sources.

export async function render(node, options = {}) {
  if (!isNode(node)) throw new Error("render() needs a node");

  // check the shape up front. doing it during evaluation cannot work: two
  // branches reading one node run concurrently, so a "currently evaluating"
  // set sees the shared node twice and calls it a cycle.
  assertAcyclic(node, new Set(), new Set());

  return evaluate(node, options.cache ?? new Map(), options.onNode);
}

function assertAcyclic(node, onPath, cleared) {
  if (cleared.has(node)) return;

  if (onPath.has(node)) {
    throw new Error(`graph contains a cycle through ${JSON.stringify(node.type)}`);
  }

  onPath.add(node);

  for (const input of node.inputs) assertAcyclic(input, onPath, cleared);

  onPath.delete(node);
  cleared.add(node);
}

// the cache holds promises rather than images, so a node that two branches
// reach at the same moment is still only applied once

function evaluate(node, cache, onNode) {
  const cached = cache.get(node);

  if (cached) return cached;

  const definition = getEffect(node.type);

  const pending = (async () => {
    // depth first, but siblings can resolve together
    const inputs = await Promise.all(node.inputs.map((input) => evaluate(input, cache, onNode)));

    const started = performance.now();
    const result = assertImage(
      await definition.apply(inputs, node.params),
      `effect ${JSON.stringify(node.type)}`,
    );
    const elapsed = performance.now() - started;

    if (onNode) onNode({ node, image: result, elapsed });

    return result;
  })();

  cache.set(node, pending);

  return pending;
}

// a graph is data, so it can be written down as json and read back
//
// shared nodes stay shared: the walk assigns each node one id and later
// references point at it, which keeps render()'s single-evaluation promise.

export function toJSON(node) {
  const nodes = [];
  const ids = new Map();

  function walk(current) {
    const existing = ids.get(current);

    if (existing !== undefined) return existing;

    const inputs = current.inputs.map(walk);
    const id = nodes.length;

    ids.set(current, id);
    nodes.push({ id, type: current.type, inputs, params: current.params });

    return id;
  }

  const output = walk(node);

  return { nodes, output };
}

export function fromJSON(spec) {
  if (!spec || !Array.isArray(spec.nodes)) {
    throw new Error("graph json needs a nodes array");
  }

  const built = new Map();
  const building = new Set();

  function build(id) {
    const existing = built.get(id);

    if (existing) return existing;

    // inputs are built before their node, so a cycle would recurse forever
    if (building.has(id)) throw new Error(`graph json contains a cycle through node ${id}`);

    const entry = spec.nodes.find((candidate) => candidate.id === id);

    if (!entry) throw new Error(`graph json references missing node ${id}`);

    building.add(id);

    const node = makeNode(entry.type, (entry.inputs ?? []).map(build), entry.params ?? {});

    building.delete(id);
    built.set(id, node);

    return node;
  }

  return build(spec.output ?? spec.nodes[spec.nodes.length - 1].id);
}

// walk the graph for reporting, without running anything

export function describe(node) {
  const lines = [];

  function walk(current, depth, seen) {
    const params = Object.entries(current.params)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(" ");

    const shared = seen.has(current) ? " (shared)" : "";

    lines.push(`${"  ".repeat(depth)}${current.type}${params ? ` ${params}` : ""}${shared}`);

    if (shared) return;

    seen.add(current);

    for (const input of current.inputs) walk(input, depth + 1, seen);
  }

  walk(node, 0, new Set());

  return lines.join("\n");
}
