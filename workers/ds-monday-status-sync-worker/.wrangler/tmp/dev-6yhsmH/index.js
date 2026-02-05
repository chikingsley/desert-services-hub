const __defProp = Object.defineProperty;
const __name = (target, value) =>
  __defProp(target, "name", { value, configurable: true });

// ../../../../../.bun/install/global/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");

// ../../../../../.bun/install/global/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
const _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
const _performanceNow = globalThis.performance?.now
  ? globalThis.performance.now.bind(globalThis.performance)
  : () => Date.now() - _timeOrigin;
const nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0,
  },
  detail: void 0,
  toJSON() {
    return this;
  },
};
const PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail,
    };
  }
};
const PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(PerformanceMark2, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
const PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
const PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
const PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(_type) {
    return [];
  }
};
const Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName
      ? this._entries.filter((e) => e.name !== markName)
      : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName
      ? this._entries.filter((e) => e.name !== measureName)
      : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter(
      (e) => e.entryType !== "resource" || e.entryType !== "navigation"
    );
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter(
      (e) => e.name === name && (!type || e.entryType === type)
    );
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]
        ?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end,
      },
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(_type, _listener, _options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(_type, _listener, _options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(_event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
const PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(_options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
const performance =
  globalThis.performance && "addEventListener" in globalThis.performance
    ? globalThis.performance
    : new Performance();

// ../../../../../.bun/install/global/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../../../../../.bun/install/global/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
const hrtime = /* @__PURE__ */ Object.assign(
  /* @__PURE__ */ __name(function hrtime2(startTime) {
    const now = Date.now();
    const seconds = Math.trunc(now / 1e3);
    const nanos = (now % 1e3) * 1e6;
    if (startTime) {
      let diffSeconds = seconds - startTime[0];
      let diffNanos = nanos - startTime[0];
      if (diffNanos < 0) {
        diffSeconds -= 1;
        diffNanos = 1e9 + diffNanos;
      }
      return [diffSeconds, diffNanos];
    }
    return [seconds, nanos];
  }, "hrtime"),
  {
    bigint: /* @__PURE__ */ __name(function bigint() {
      return BigInt(Date.now() * 1e6);
    }, "bigint"),
  }
);

// ../../../../../.bun/install/global/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../../../../../.bun/install/global/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
const ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../../../../../.bun/install/global/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
const WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(_dir, callback) {
    callback?.();
    return false;
  }
  clearScreenDown(callback) {
    callback?.();
    return false;
  }
  cursorTo(_x, _y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(_dx, _dy, callback) {
    callback?.();
    return false;
  }
  getColorDepth(_env2) {
    return 1;
  }
  hasColors(_count, _env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, _encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {}
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../../../../../.bun/install/global/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
const NODE_VERSION = "22.14.0";

// ../../../../../.bun/install/global/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
const Process = class _Process extends EventEmitter {
  static {
    __name(_Process, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [
      ...Object.getOwnPropertyNames(_Process.prototype),
      ...Object.getOwnPropertyNames(EventEmitter.prototype),
    ]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(
      `${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`
    );
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return (this.#stdin ??= new ReadStream(0));
  }
  get stdout() {
    return (this.#stdout ??= new WriteStream(1));
  }
  get stderr() {
    return (this.#stderr ??= new WriteStream(2));
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {}
  unref() {}
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError(
      "process.setUncaughtExceptionCaptureCallback"
    );
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError(
      "process.hasUncaughtExceptionCaptureCallback"
    );
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = {
    has: /* @__PURE__ */ notImplemented("process.permission.has"),
  };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport"),
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented(
      "process.finalization.unregister"
    ),
    registerBeforeExit: /* @__PURE__ */ notImplemented(
      "process.finalization.registerBeforeExit"
    ),
  };
  memoryUsage = Object.assign(
    () => ({
      arrayBuffers: 0,
      rss: 0,
      external: 0,
      heapTotal: 0,
      heapUsed: 0,
    }),
    { rss: /* @__PURE__ */ __name(() => 0, "rss") }
  );
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../../../../../.bun/install/global/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
const globalProcess = globalThis.process;
const getBuiltinModule = globalProcess.getBuiltinModule;
const workerdProcess = getBuiltinModule("node:process");
const isWorkerdProcessV2 =
  globalThis.Cloudflare.compatibilityFlags.enable_nodejs_process_v2;
const unenvProcess = new Process({
  env: globalProcess.env,
  // `hrtime` is only available from workerd process v2
  hrtime: isWorkerdProcessV2 ? workerdProcess.hrtime : hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick,
});
const { exit, features, platform } = workerdProcess;
const {
  // Always implemented by workerd
  env,
  // Only implemented in workerd v2
  hrtime: hrtime3,
  // Always implemented by workerd
  nextTick,
} = unenvProcess;
const {
  _channel,
  _disconnect,
  _events,
  _eventsCount,
  _handleQueue,
  _maxListeners,
  _pendingMessage,
  _send,
  assert,
  disconnect,
  mainModule,
} = unenvProcess;
const {
  // @ts-expect-error `_debugEnd` is missing typings
  _debugEnd,
  // @ts-expect-error `_debugProcess` is missing typings
  _debugProcess,
  // @ts-expect-error `_exiting` is missing typings
  _exiting,
  // @ts-expect-error `_fatalException` is missing typings
  _fatalException,
  // @ts-expect-error `_getActiveHandles` is missing typings
  _getActiveHandles,
  // @ts-expect-error `_getActiveRequests` is missing typings
  _getActiveRequests,
  // @ts-expect-error `_kill` is missing typings
  _kill,
  // @ts-expect-error `_linkedBinding` is missing typings
  _linkedBinding,
  // @ts-expect-error `_preload_modules` is missing typings
  _preload_modules,
  // @ts-expect-error `_rawDebug` is missing typings
  _rawDebug,
  // @ts-expect-error `_startProfilerIdleNotifier` is missing typings
  _startProfilerIdleNotifier,
  // @ts-expect-error `_stopProfilerIdleNotifier` is missing typings
  _stopProfilerIdleNotifier,
  // @ts-expect-error `_tickCallback` is missing typings
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  availableMemory,
  // @ts-expect-error `binding` is missing typings
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  // @ts-expect-error `domain` is missing typings
  domain,
  emit,
  emitWarning,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  // @ts-expect-error `initgroups` is missing typings
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  memoryUsage,
  // @ts-expect-error `moduleLoadList` is missing typings
  moduleLoadList,
  off,
  on,
  once,
  // @ts-expect-error `openStdin` is missing typings
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  // @ts-expect-error `reallyExit` is missing typings
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions,
} = isWorkerdProcessV2 ? workerdProcess : unenvProcess;
const _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding,
};
const process_default = _process;

// ../../../../../.bun/install/global/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/index.ts
const ESTIMATING_BOARD_ID = "7943937851";
const LEADS_BOARD_ID = "7943937841";
const BID_STATUS_COLUMN_ID = "deal_stage";
const TARGET_STATUS = "GC Not Awarded";
const OVERALL_STATUS_COL = "color_mm068kjz";
const ESTIMATE_LINK_COL = "board_relation_mktg3z60";
const WON_GROUP = "group_mkthxpv3";
const OPEN_GROUP = "group_mkt5hjqh";
const SENT_GROUP = "group_mkt5fv3a";
const PREFIX_PATTERN =
  /^(TF|PJ|RO|REBID|CFS|INSPECTIONS|LW|MISC|SF|SS)[\s\-_:]+/i;
const BID_TO_OVERALL_STATUS = {
  Won: "Won",
  "Pending Won": "Won",
  "Add to Projects": "Won",
  Lost: "Lost",
  "GC Not Awarded": "Lost",
  Duplicates: "Lost",
};
const src_default = {
  // HTTP handler for manual trigger / testing
  async fetch(request, env2) {
    const url = new URL(request.url);
    if (url.pathname === "/gc/run") {
      const result = await runCleanup(env2);
      return Response.json(result);
    }
    if (url.pathname === "/gc/dry-run") {
      const result = await runCleanup(env2, true);
      return Response.json(result);
    }
    if (url.pathname === "/leads/run") {
      const result = await runLeadsSync(env2);
      return Response.json(result);
    }
    if (url.pathname === "/leads/dry-run") {
      const result = await runLeadsSync(env2, true);
      return Response.json(result);
    }
    if (url.pathname === "/run") {
      const gcResult = await runCleanup(env2);
      const leadsResult = await runLeadsSync(env2);
      return Response.json({ gc: gcResult, leads: leadsResult });
    }
    if (url.pathname === "/dry-run") {
      const gcResult = await runCleanup(env2, true);
      const leadsResult = await runLeadsSync(env2, true);
      return Response.json({ gc: gcResult, leads: leadsResult });
    }
    return new Response(
      `Status Sync Worker

Endpoints:
  /dry-run       - Preview all syncs
  /run           - Execute all syncs

  /gc/dry-run    - Preview GC cleanup only
  /gc/run        - Execute GC cleanup only

  /leads/dry-run - Preview Leads sync only
  /leads/run     - Execute Leads sync only

Cron: Daily at 6am UTC

Jobs:
1. GC Cleanup: Updates competing estimates to "GC Not Awarded"
2. Leads Sync: Syncs Leads Overall Status from Estimate Bid Status`,
      { headers: { "Content-Type": "text/plain" } }
    );
  },
  // Scheduled handler for cron trigger
  async scheduled(_event, env2, ctx) {
    ctx.waitUntil(
      Promise.all([
        runCleanup(env2).then((result) => {
          console.log(
            `[GC Cleanup] Complete: ${result.updatedCount} updated, ${result.errors.length} errors`
          );
        }),
        runLeadsSync(env2).then((result) => {
          console.log(
            `[Leads Sync] Complete: ${result.updatedCount} updated, ${result.errors.length} errors`
          );
        }),
      ])
    );
  },
};
async function runCleanup(env2, dryRun = false) {
  const result = {
    wonCount: 0,
    openSentCount: 0,
    toUpdateCount: 0,
    updatedCount: 0,
    errors: [],
  };
  try {
    console.log("[GC Cleanup] Fetching Won items...");
    const wonItems = await getItemsFromGroup(env2, WON_GROUP);
    result.wonCount = wonItems.length;
    console.log(`[GC Cleanup] Found ${wonItems.length} Won items`);
    const wonBaseNames = new Set(wonItems.map((i) => getBaseName(i.name)));
    console.log("[GC Cleanup] Fetching Open + Sent items...");
    const openItems = await getItemsFromGroup(env2, OPEN_GROUP);
    const sentItems = await getItemsFromGroup(env2, SENT_GROUP);
    const openSentItems = [...openItems, ...sentItems];
    result.openSentCount = openSentItems.length;
    console.log(`[GC Cleanup] Found ${openSentItems.length} Open/Sent items`);
    const toUpdate = openSentItems.filter((item) => {
      const baseName = getBaseName(item.name);
      return wonBaseNames.has(baseName);
    });
    result.toUpdateCount = toUpdate.length;
    console.log(`[GC Cleanup] ${toUpdate.length} items match Won projects`);
    if (dryRun) {
      console.log("[GC Cleanup] Dry run - not updating");
      return result;
    }
    for (const item of toUpdate) {
      try {
        await updateItemStatus(env2, item.id, TARGET_STATUS);
        result.updatedCount++;
        console.log(`[GC Cleanup] Updated: ${item.name}`);
        await sleep(200);
      } catch (error) {
        const msg = `Failed to update ${item.name}: ${error}`;
        result.errors.push(msg);
        console.error(`[GC Cleanup] ${msg}`);
      }
    }
    return result;
  } catch (error) {
    result.errors.push(`Cleanup failed: ${error}`);
    console.error(`[GC Cleanup] ${error}`);
    return result;
  }
}
__name(runCleanup, "runCleanup");
async function runLeadsSync(env2, dryRun = false) {
  const result = {
    leadsCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errors: [],
  };
  try {
    console.log("[Leads Sync] Fetching leads...");
    const leads = await getLeadsWithEstimates(env2);
    result.leadsCount = leads.length;
    console.log(
      `[Leads Sync] Found ${leads.length} leads with linked estimates`
    );
    const estimateIds = [...new Set(leads.map((l) => l.estimateId))];
    console.log(
      `[Leads Sync] Fetching ${estimateIds.length} estimate statuses...`
    );
    const estimateStatuses = await getEstimateStatuses(env2, estimateIds);
    for (const lead of leads) {
      const bidStatus = estimateStatuses.get(lead.estimateId);
      const newOverallStatus = bidStatus
        ? BID_TO_OVERALL_STATUS[bidStatus]
        : null;
      if (!newOverallStatus || newOverallStatus === lead.currentStatus) {
        result.skippedCount++;
        continue;
      }
      if (dryRun) {
        console.log(
          `[Leads Sync] Would update "${lead.name}": ${lead.currentStatus || "-"} \u2192 ${newOverallStatus}`
        );
        result.updatedCount++;
        continue;
      }
      try {
        await updateLeadOverallStatus(env2, lead.id, newOverallStatus);
        console.log(
          `[Leads Sync] Updated "${lead.name}": \u2192 ${newOverallStatus}`
        );
        result.updatedCount++;
        await sleep(200);
      } catch (error) {
        const msg = `Failed to update ${lead.name}: ${error}`;
        result.errors.push(msg);
        console.error(`[Leads Sync] ${msg}`);
      }
    }
    return result;
  } catch (error) {
    result.errors.push(`Leads sync failed: ${error}`);
    console.error(`[Leads Sync] ${error}`);
    return result;
  }
}
__name(runLeadsSync, "runLeadsSync");
async function getLeadsWithEstimates(env2) {
  const leads = [];
  let cursor = null;
  do {
    const cursorPart = cursor ? `, cursor: "${cursor}"` : "";
    const query = `
      query {
        boards(ids: ${LEADS_BOARD_ID}) {
          items_page(limit: 200${cursorPart}) {
            cursor
            items {
              id
              name
              column_values(ids: ["${ESTIMATE_LINK_COL}", "${OVERALL_STATUS_COL}"]) {
                id
                ... on BoardRelationValue { linked_item_ids }
                ... on StatusValue { label }
              }
            }
          }
        }
      }
    `;
    const data = await mondayQuery(env2, query);
    const page = data.boards?.[0]?.items_page;
    if (page?.items) {
      for (const item of page.items) {
        const estimateCol = item.column_values.find(
          (c) => c.id === ESTIMATE_LINK_COL
        );
        const statusCol = item.column_values.find(
          (c) => c.id === OVERALL_STATUS_COL
        );
        if (estimateCol?.linked_item_ids?.[0]) {
          leads.push({
            id: item.id,
            name: item.name,
            estimateId: estimateCol.linked_item_ids[0],
            currentStatus: statusCol?.label ?? null,
          });
        }
      }
    }
    cursor = page?.cursor ?? null;
  } while (cursor);
  return leads;
}
__name(getLeadsWithEstimates, "getLeadsWithEstimates");
async function getEstimateStatuses(env2, estimateIds) {
  const statusMap = /* @__PURE__ */ new Map();
  const BATCH = 50;
  for (let i = 0; i < estimateIds.length; i += BATCH) {
    const batch = estimateIds.slice(i, i + BATCH);
    const idsStr = batch.join(",");
    const query = `
      query {
        items(ids: [${idsStr}]) {
          id
          column_values(ids: ["${BID_STATUS_COLUMN_ID}"]) {
            id
            ... on StatusValue { label }
          }
        }
      }
    `;
    const data = await mondayQuery(env2, query);
    for (const item of data.items) {
      const statusCol = item.column_values.find(
        (c) => c.id === BID_STATUS_COLUMN_ID
      );
      if (statusCol?.label) {
        statusMap.set(item.id, statusCol.label);
      }
    }
  }
  return statusMap;
}
__name(getEstimateStatuses, "getEstimateStatuses");
async function updateLeadOverallStatus(env2, leadId, status) {
  const query = `
    mutation {
      change_simple_column_value(
        board_id: ${LEADS_BOARD_ID}
        item_id: ${leadId}
        column_id: "${OVERALL_STATUS_COL}"
        value: "${status}"
      ) { id }
    }
  `;
  await mondayQuery(env2, query);
}
__name(updateLeadOverallStatus, "updateLeadOverallStatus");
async function mondayQuery(env2, query) {
  const response = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env2.MONDAY_API_KEY,
      "API-Version": "2026-01",
    },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    throw new Error(`Monday API error: ${response.status}`);
  }
  const json = await response.json();
  if (json.errors) {
    throw new Error(`Monday API errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}
__name(mondayQuery, "mondayQuery");
async function getItemsFromGroup(env2, groupId) {
  const items = [];
  let cursor = null;
  do {
    const cursorPart = cursor ? `, cursor: "${cursor}"` : "";
    const query = `
      query {
        boards(ids: ${ESTIMATING_BOARD_ID}) {
          groups(ids: "${groupId}") {
            items_page(limit: 500${cursorPart}) {
              cursor
              items { 
                id 
                name 
              }
            }
          }
        }
      }
    `;
    const data = await mondayQuery(env2, query);
    const page = data.boards?.[0]?.groups?.[0]?.items_page;
    if (page?.items) {
      items.push(...page.items);
    }
    cursor = page?.cursor ?? null;
  } while (cursor);
  return items;
}
__name(getItemsFromGroup, "getItemsFromGroup");
async function updateItemStatus(env2, itemId, status) {
  const escapedStatus = status.replace(/"/g, '\\"');
  const query = `
    mutation {
      change_simple_column_value(
        board_id: ${ESTIMATING_BOARD_ID}
        item_id: ${itemId}
        column_id: "${BID_STATUS_COLUMN_ID}"
        value: "${escapedStatus}"
      ) { id }
    }
  `;
  await mondayQuery(env2, query);
}
__name(updateItemStatus, "updateItemStatus");
function getBaseName(name) {
  return name.replace(PREFIX_PATTERN, "").trim().toUpperCase();
}
__name(getBaseName, "getBaseName");
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");

// ../../../../../.bun/install/global/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
const drainBody = /* @__PURE__ */ __name(
  async (request, env2, _ctx, middlewareCtx) => {
    try {
      return await middlewareCtx.next(request, env2);
    } finally {
      try {
        if (request.body !== null && !request.bodyUsed) {
          const reader = request.body.getReader();
          while (!(await reader.read()).done) {}
        }
      } catch (e) {
        console.error("Failed to drain the unused request body.", e);
      }
    }
  },
  "drainBody"
);
const middleware_ensure_req_body_drained_default = drainBody;

// .wrangler/tmp/bundle-DlJ4Mc/middleware-insertion-facade.js
const __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
];
const middleware_insertion_facade_default = src_default;

// ../../../../../.bun/install/global/node_modules/wrangler/templates/middleware/common.ts
const __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env2, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    },
  };
  return head(request, env2, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env2, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env2, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware,
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-DlJ4Mc/middleware-loader.entry.ts
const __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(___Facade_ScheduledController__, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (
    __INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 ||
    __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0
  ) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name((request, env2, ctx) => {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env2, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env2, ctx) {
      const dispatcher = /* @__PURE__ */ __name((type, init) => {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {}
          );
          return worker.scheduled(controller, env2, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env2, ctx, dispatcher, fetchDispatcher);
    },
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (
    __INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 ||
    __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0
  ) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env2, ctx) => {
      this.env = env2;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {}
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
let WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
const middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default,
};
//# sourceMappingURL=index.js.map
