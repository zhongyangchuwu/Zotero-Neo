var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// owner-react:react
var react_exports = {};
__export(react_exports, {
  Activity: () => Activity,
  Children: () => Children,
  Component: () => Component,
  Fragment: () => Fragment,
  Profiler: () => Profiler,
  PureComponent: () => PureComponent,
  StrictMode: () => StrictMode,
  Suspense: () => Suspense,
  ViewTransition: () => ViewTransition,
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: () => __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  __COMPILER_RUNTIME: () => __COMPILER_RUNTIME,
  act: () => act,
  addTransitionType: () => addTransitionType,
  cache: () => cache,
  cacheSignal: () => cacheSignal,
  captureOwnerStack: () => captureOwnerStack,
  cloneElement: () => cloneElement,
  createContext: () => createContext,
  createElement: () => createElement,
  createRef: () => createRef,
  default: () => react_default,
  forwardRef: () => forwardRef,
  isValidElement: () => isValidElement,
  lazy: () => lazy,
  memo: () => memo,
  startTransition: () => startTransition,
  unstable_useCacheRefresh: () => unstable_useCacheRefresh,
  use: () => use,
  useActionState: () => useActionState,
  useCallback: () => useCallback,
  useContext: () => useContext,
  useDebugValue: () => useDebugValue,
  useDeferredValue: () => useDeferredValue,
  useEffect: () => useEffect,
  useEffectEvent: () => useEffectEvent,
  useId: () => useId,
  useImperativeHandle: () => useImperativeHandle,
  useInsertionEffect: () => useInsertionEffect,
  useLayoutEffect: () => useLayoutEffect,
  useMemo: () => useMemo,
  useOptimistic: () => useOptimistic,
  useReducer: () => useReducer,
  useRef: () => useRef,
  useState: () => useState,
  useSyncExternalStore: () => useSyncExternalStore,
  useTransition: () => useTransition,
  version: () => version
});
import { React as runtime } from "../react/index.js";
var Activity, Children, Component, Fragment, Profiler, PureComponent, StrictMode, Suspense, ViewTransition, __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, __COMPILER_RUNTIME, act, addTransitionType, cache, cacheSignal, captureOwnerStack, cloneElement, createContext, createElement, createRef, forwardRef, isValidElement, lazy, memo, startTransition, unstable_useCacheRefresh, use, useActionState, useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useEffectEvent, useId, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useOptimistic, useReducer, useRef, useState, useSyncExternalStore, useTransition, version, react_default;
var init_react = __esm({
  "owner-react:react"() {
    ({ Activity, Children, Component, Fragment, Profiler, PureComponent, StrictMode, Suspense, ViewTransition, __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, __COMPILER_RUNTIME, act, addTransitionType, cache, cacheSignal, captureOwnerStack, cloneElement, createContext, createElement, createRef, forwardRef, isValidElement, lazy, memo, startTransition, unstable_useCacheRefresh, use, useActionState, useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useEffectEvent, useId, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useOptimistic, useReducer, useRef, useState, useSyncExternalStore, useTransition, version } = runtime);
    react_default = runtime;
  }
});

// node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.production.js
var require_use_sync_external_store_shim_production = __commonJS({
  "node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.production.js"(exports) {
    "use strict";
    var React = (init_react(), __toCommonJS(react_exports));
    function is(x, y) {
      return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
    }
    var objectIs = "function" === typeof Object.is ? Object.is : is;
    var useState2 = React.useState;
    var useEffect2 = React.useEffect;
    var useLayoutEffect2 = React.useLayoutEffect;
    var useDebugValue2 = React.useDebugValue;
    function useSyncExternalStore$2(subscribe, getSnapshot) {
      var value = getSnapshot(), _useState = useState2({ inst: { value, getSnapshot } }), inst = _useState[0].inst, forceUpdate = _useState[1];
      useLayoutEffect2(
        function() {
          inst.value = value;
          inst.getSnapshot = getSnapshot;
          checkIfSnapshotChanged(inst) && forceUpdate({ inst });
        },
        [subscribe, value, getSnapshot]
      );
      useEffect2(
        function() {
          checkIfSnapshotChanged(inst) && forceUpdate({ inst });
          return subscribe(function() {
            checkIfSnapshotChanged(inst) && forceUpdate({ inst });
          });
        },
        [subscribe]
      );
      useDebugValue2(value);
      return value;
    }
    function checkIfSnapshotChanged(inst) {
      var latestGetSnapshot = inst.getSnapshot;
      inst = inst.value;
      try {
        var nextValue = latestGetSnapshot();
        return !objectIs(inst, nextValue);
      } catch (error) {
        return true;
      }
    }
    function useSyncExternalStore$1(subscribe, getSnapshot) {
      return getSnapshot();
    }
    var shim = "undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement ? useSyncExternalStore$1 : useSyncExternalStore$2;
    exports.useSyncExternalStore = void 0 !== React.useSyncExternalStore ? React.useSyncExternalStore : shim;
  }
});

// node_modules/use-sync-external-store/shim/index.js
var require_shim = __commonJS({
  "node_modules/use-sync-external-store/shim/index.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_use_sync_external_store_shim_production();
    } else {
      module.exports = null;
    }
  }
});

// node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.js
var require_with_selector_production = __commonJS({
  "node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.js"(exports) {
    "use strict";
    var React = (init_react(), __toCommonJS(react_exports));
    var shim = require_shim();
    function is(x, y) {
      return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
    }
    var objectIs = "function" === typeof Object.is ? Object.is : is;
    var useSyncExternalStore4 = shim.useSyncExternalStore;
    var useRef2 = React.useRef;
    var useEffect2 = React.useEffect;
    var useMemo2 = React.useMemo;
    var useDebugValue2 = React.useDebugValue;
    exports.useSyncExternalStoreWithSelector = function(subscribe, getSnapshot, getServerSnapshot, selector, isEqual) {
      var instRef = useRef2(null);
      if (null === instRef.current) {
        var inst = { hasValue: false, value: null };
        instRef.current = inst;
      } else inst = instRef.current;
      instRef = useMemo2(
        function() {
          function memoizedSelector(nextSnapshot) {
            if (!hasMemo) {
              hasMemo = true;
              memoizedSnapshot = nextSnapshot;
              nextSnapshot = selector(nextSnapshot);
              if (void 0 !== isEqual && inst.hasValue) {
                var currentSelection = inst.value;
                if (isEqual(currentSelection, nextSnapshot))
                  return memoizedSelection = currentSelection;
              }
              return memoizedSelection = nextSnapshot;
            }
            currentSelection = memoizedSelection;
            if (objectIs(memoizedSnapshot, nextSnapshot)) return currentSelection;
            var nextSelection = selector(nextSnapshot);
            if (void 0 !== isEqual && isEqual(currentSelection, nextSelection))
              return memoizedSnapshot = nextSnapshot, currentSelection;
            memoizedSnapshot = nextSnapshot;
            return memoizedSelection = nextSelection;
          }
          var hasMemo = false, memoizedSnapshot, memoizedSelection, maybeGetServerSnapshot = void 0 === getServerSnapshot ? null : getServerSnapshot;
          return [
            function() {
              return memoizedSelector(getSnapshot());
            },
            null === maybeGetServerSnapshot ? void 0 : function() {
              return memoizedSelector(maybeGetServerSnapshot());
            }
          ];
        },
        [getSnapshot, getServerSnapshot, selector, isEqual]
      );
      var value = useSyncExternalStore4(subscribe, instRef[0], instRef[1]);
      useEffect2(
        function() {
          inst.hasValue = true;
          inst.value = value;
        },
        [value]
      );
      useDebugValue2(value);
      return value;
    };
  }
});

// node_modules/use-sync-external-store/shim/with-selector.js
var require_with_selector = __commonJS({
  "node_modules/use-sync-external-store/shim/with-selector.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_with_selector_production();
    } else {
      module.exports = null;
    }
  }
});

// node_modules/@base-ui/react/menu/index.parts.mjs
var index_parts_exports = {};
__export(index_parts_exports, {
  Arrow: () => MenuArrow,
  Backdrop: () => MenuBackdrop,
  CheckboxItem: () => MenuCheckboxItem,
  CheckboxItemIndicator: () => MenuCheckboxItemIndicator,
  Clear: () => MenuClear,
  Empty: () => MenuEmpty,
  FilterProvider: () => MenuFilterProvider,
  Group: () => MenuGroup,
  GroupLabel: () => MenuGroupLabel,
  Handle: () => MenuHandle,
  Input: () => MenuInput,
  Item: () => MenuItem,
  LinkItem: () => MenuLinkItem,
  List: () => MenuList,
  Popup: () => MenuPopup,
  Portal: () => MenuPortal,
  Positioner: () => MenuPositioner,
  RadioGroup: () => MenuRadioGroup,
  RadioItem: () => MenuRadioItem,
  RadioItemIndicator: () => MenuRadioItemIndicator,
  Root: () => MenuRoot,
  Separator: () => Separator,
  SubmenuRoot: () => MenuSubmenuRoot,
  SubmenuTrigger: () => MenuSubmenuTrigger,
  Trigger: () => MenuTrigger,
  Viewport: () => MenuViewport,
  createHandle: () => createMenuHandle,
  useFilter: () => getFilter
});

// node_modules/@base-ui/react/menu/arrow/MenuArrow.mjs
init_react();

// node_modules/@base-ui/utils/formatErrorMessage.mjs
function createFormatErrorMessage(baseUrl, prefix) {
  return function formatErrorMessage2(code, ...args) {
    const url = new URL(baseUrl);
    url.searchParams.set("code", code.toString());
    args.forEach((arg) => url.searchParams.append("args[]", arg));
    return `${prefix} error #${code}; visit ${url} for the full message.`;
  };
}
var formatErrorMessage = createFormatErrorMessage("https://base-ui.com/production-error", "Base UI");
var formatErrorMessage_default = formatErrorMessage;

// node_modules/@base-ui/react/menu/positioner/MenuPositionerContext.mjs
init_react();
var MenuPositionerContext = /* @__PURE__ */ createContext(void 0);
if (false) MenuPositionerContext.displayName = "MenuPositionerContext";
function useMenuPositionerContext(optional) {
  const context = useContext(MenuPositionerContext);
  if (context === void 0 && !optional) {
    throw new Error(false ? "Base UI: MenuPositionerContext is missing. MenuPositioner parts must be placed within <Menu.Positioner>." : formatErrorMessage_default(33));
  }
  return context;
}

// node_modules/@base-ui/react/menu/root/MenuRootContext.mjs
init_react();
var MenuRootContext = /* @__PURE__ */ createContext(void 0);
if (false) MenuRootContext.displayName = "MenuRootContext";
function useMenuRootContext(optional) {
  const context = useContext(MenuRootContext);
  if (context === void 0 && !optional) {
    throw new Error(false ? "Base UI: MenuRootContext is missing. Menu parts must be placed within <Menu.Root>." : formatErrorMessage_default(36));
  }
  return context;
}

// node_modules/@base-ui/react/internals/useRenderElement.mjs
init_react();

// node_modules/@base-ui/utils/useRefWithInit.mjs
init_react();
var UNINITIALIZED = {};
function useRefWithInit(init, initArg) {
  const ref = useRef(UNINITIALIZED);
  if (ref.current === UNINITIALIZED) {
    ref.current = init(initArg);
  }
  return ref;
}

// node_modules/@base-ui/utils/useMergedRefs.mjs
function useMergedRefs(a, b, c, d) {
  const forkRef = useRefWithInit(createForkRef).current;
  if (didChange(forkRef, a, b, c, d)) {
    update(forkRef, [a, b, c, d]);
  }
  return forkRef.callback;
}
function useMergedRefsN(refs) {
  const forkRef = useRefWithInit(createForkRef).current;
  if (didChangeN(forkRef, refs)) {
    update(forkRef, refs);
  }
  return forkRef.callback;
}
function createForkRef() {
  return {
    callback: null,
    cleanup: null,
    refs: []
  };
}
function didChange(forkRef, a, b, c, d) {
  return forkRef.refs[0] !== a || forkRef.refs[1] !== b || forkRef.refs[2] !== c || forkRef.refs[3] !== d;
}
function didChangeN(forkRef, newRefs) {
  return forkRef.refs.length !== newRefs.length || forkRef.refs.some((ref, index2) => ref !== newRefs[index2]);
}
function update(forkRef, refs) {
  forkRef.refs = refs;
  if (refs.every((ref) => ref == null)) {
    forkRef.callback = null;
    return;
  }
  forkRef.callback = (instance) => {
    if (forkRef.cleanup) {
      forkRef.cleanup();
      forkRef.cleanup = null;
    }
    if (instance != null) {
      const cleanupCallbacks = Array(refs.length).fill(null);
      for (let i = 0; i < refs.length; i += 1) {
        const ref = refs[i];
        if (ref == null) {
          continue;
        }
        switch (typeof ref) {
          case "function": {
            const refCleanup = ref(instance);
            if (typeof refCleanup === "function") {
              cleanupCallbacks[i] = refCleanup;
            }
            break;
          }
          case "object": {
            ref.current = instance;
            break;
          }
          default:
        }
      }
      forkRef.cleanup = () => {
        for (let i = 0; i < refs.length; i += 1) {
          const ref = refs[i];
          if (ref == null) {
            continue;
          }
          switch (typeof ref) {
            case "function": {
              const cleanupCallback = cleanupCallbacks[i];
              if (typeof cleanupCallback === "function") {
                cleanupCallback();
              } else {
                void ref(null);
              }
              break;
            }
            case "object": {
              ref.current = null;
              break;
            }
            default:
          }
        }
      };
    }
  };
}

// node_modules/@base-ui/utils/getReactElementRef.mjs
init_react();

// node_modules/@base-ui/utils/reactVersion.mjs
init_react();
var majorVersion = parseInt(version, 10);
function isReactVersionAtLeast(reactVersionToCheck) {
  return majorVersion >= reactVersionToCheck;
}

// node_modules/@base-ui/utils/getReactElementRef.mjs
function getReactElementRef(element) {
  if (!/* @__PURE__ */ isValidElement(element)) {
    return null;
  }
  const reactElement = element;
  const propsWithRef = reactElement.props;
  return (isReactVersionAtLeast(19) ? propsWithRef?.ref : reactElement.ref) ?? null;
}

// node_modules/@base-ui/utils/mergeObjects.mjs
function mergeObjects(a, b) {
  if (a && !b) {
    return a;
  }
  if (!a && b) {
    return b;
  }
  if (a || b) {
    return {
      ...a,
      ...b
    };
  }
  return void 0;
}

// node_modules/@base-ui/utils/empty.mjs
function NOOP() {
}
var EMPTY_ARRAY = Object.freeze([]);
var EMPTY_OBJECT = Object.freeze({});

// node_modules/@base-ui/react/internals/getStateAttributesProps.mjs
function getStateAttributesProps(state, customMapping) {
  const props = {};
  for (const key in state) {
    const value = state[key];
    if (customMapping?.hasOwnProperty(key)) {
      const customProps = customMapping[key](value);
      if (customProps != null) {
        Object.assign(props, customProps);
      }
      continue;
    }
    if (value === true) {
      props[`data-${key.toLowerCase()}`] = "";
    } else if (value) {
      props[`data-${key.toLowerCase()}`] = value.toString();
    }
  }
  return props;
}

// node_modules/@base-ui/react/utils/resolveClassName.mjs
function resolveClassName(className, state) {
  return typeof className === "function" ? className(state) : className;
}

// node_modules/@base-ui/react/utils/resolveStyle.mjs
function resolveStyle(style, state) {
  return typeof style === "function" ? style(state) : style;
}

// node_modules/@base-ui/react/merge-props/mergeProps.mjs
var EMPTY_PROPS = {};
function mergeProps(a, b, c, d, e) {
  if (!c && !d && !e && !a) {
    return createInitialMergedProps(b);
  }
  let merged = createInitialMergedProps(a);
  if (b) {
    merged = mergeInto(merged, b);
  }
  if (c) {
    merged = mergeInto(merged, c);
  }
  if (d) {
    merged = mergeInto(merged, d);
  }
  if (e) {
    merged = mergeInto(merged, e);
  }
  return merged;
}
function mergePropsN(props) {
  if (props.length === 0) {
    return EMPTY_PROPS;
  }
  if (props.length === 1) {
    return createInitialMergedProps(props[0]);
  }
  let merged = createInitialMergedProps(props[0]);
  for (let i = 1; i < props.length; i += 1) {
    merged = mergeInto(merged, props[i]);
  }
  return merged;
}
function createInitialMergedProps(inputProps) {
  if (isPropsGetter(inputProps)) {
    return {
      ...inputProps(EMPTY_PROPS)
    };
  }
  return copyInitialProps(inputProps);
}
function mergeInto(merged, inputProps) {
  if (isPropsGetter(inputProps)) {
    return inputProps(merged);
  }
  return mutablyMergeInto(merged, inputProps);
}
function copyInitialProps(inputProps) {
  const copiedProps = {
    ...inputProps
  };
  for (const propName in copiedProps) {
    const propValue = copiedProps[propName];
    if (isEventHandler(propName, propValue)) {
      copiedProps[propName] = wrapEventHandler(propValue);
    }
  }
  return copiedProps;
}
function mutablyMergeInto(mergedProps, externalProps) {
  if (!externalProps) {
    return mergedProps;
  }
  for (const propName in externalProps) {
    const externalPropValue = externalProps[propName];
    switch (propName) {
      case "style": {
        mergedProps[propName] = mergeObjects(mergedProps.style, externalPropValue);
        break;
      }
      case "className": {
        mergedProps[propName] = mergeClassNames(mergedProps.className, externalPropValue);
        break;
      }
      default: {
        if (isEventHandler(propName, externalPropValue)) {
          mergedProps[propName] = mergeEventHandlers(mergedProps[propName], externalPropValue);
        } else {
          mergedProps[propName] = externalPropValue;
        }
      }
    }
  }
  return mergedProps;
}
function isEventHandler(key, value) {
  const code0 = key.charCodeAt(0);
  const code1 = key.charCodeAt(1);
  const code2 = key.charCodeAt(2);
  return code0 === 111 && code1 === 110 && code2 >= 65 && code2 <= 90 && (typeof value === "function" || typeof value === "undefined");
}
function isPropsGetter(inputProps) {
  return typeof inputProps === "function";
}
function mergeEventHandlers(ourHandler, theirHandler) {
  if (!theirHandler) {
    return ourHandler;
  }
  if (!ourHandler) {
    return wrapEventHandler(theirHandler);
  }
  return (...args) => {
    const event = args[0];
    if (isSyntheticEvent(event)) {
      const baseUIEvent = event;
      makeEventPreventable(baseUIEvent);
      const result2 = theirHandler(...args);
      if (!baseUIEvent.baseUIHandlerPrevented) {
        ourHandler?.(...args);
      }
      return result2;
    }
    const result = theirHandler(...args);
    ourHandler?.(...args);
    return result;
  };
}
function wrapEventHandler(handler) {
  if (!handler) {
    return handler;
  }
  return (...args) => {
    const event = args[0];
    if (isSyntheticEvent(event)) {
      makeEventPreventable(event);
    }
    return handler(...args);
  };
}
function makeEventPreventable(event) {
  event.preventBaseUIHandler = () => {
    event.baseUIHandlerPrevented = true;
  };
  return event;
}
function mergeClassNames(ourClassName, theirClassName) {
  if (theirClassName) {
    if (ourClassName) {
      return theirClassName + " " + ourClassName;
    }
    return theirClassName;
  }
  return ourClassName;
}
function isSyntheticEvent(event) {
  return event != null && typeof event === "object" && "nativeEvent" in event;
}

// node_modules/@base-ui/react/internals/useRenderElement.mjs
init_react();
function useRenderElement(element, componentProps, params = {}) {
  let renderProp = componentProps.render;
  if (params.enabled !== false) {
    renderProp = unwrapLazyRenderProp(renderProp);
  }
  const outProps = useRenderElementProps(componentProps, params, renderProp);
  if (params.enabled === false) {
    return null;
  }
  const state = params.state ?? EMPTY_OBJECT;
  return evaluateRenderProp(element, renderProp, outProps, state);
}
function useRenderElementProps(componentProps, params, renderProp) {
  const {
    className: classNameProp,
    style: styleProp
  } = componentProps;
  const {
    state = EMPTY_OBJECT,
    ref,
    props,
    stateAttributesMapping: stateAttributesMapping2,
    enabled = true
  } = params;
  const className = enabled ? resolveClassName(classNameProp, state) : void 0;
  const style = enabled ? resolveStyle(styleProp, state) : void 0;
  const stateProps = enabled ? getStateAttributesProps(state, stateAttributesMapping2) : EMPTY_OBJECT;
  const resolvedProps = enabled && props ? resolveRenderFunctionProps(props) : void 0;
  const outProps = enabled ? mergeObjects(stateProps, resolvedProps) ?? {} : EMPTY_OBJECT;
  if (typeof document !== "undefined") {
    if (!enabled) {
      void useMergedRefs(null, null);
    } else if (Array.isArray(ref)) {
      outProps.ref = useMergedRefsN([outProps.ref, getReactElementRef(renderProp), ...ref]);
    } else {
      outProps.ref = useMergedRefs(outProps.ref, getReactElementRef(renderProp), ref);
    }
  }
  if (!enabled) {
    return EMPTY_OBJECT;
  }
  if (className !== void 0) {
    outProps.className = mergeClassNames(outProps.className, className);
  }
  if (style !== void 0) {
    outProps.style = mergeObjects(outProps.style, style);
  }
  return outProps;
}
function resolveRenderFunctionProps(props) {
  if (Array.isArray(props)) {
    return mergePropsN(props);
  }
  return mergeProps(void 0, props);
}
var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
function unwrapLazyRenderProp(render) {
  if (render?.$$typeof !== REACT_LAZY_TYPE) {
    return render;
  }
  const unwrapped = Children.toArray(render)[0];
  return /* @__PURE__ */ isValidElement(unwrapped) ? unwrapped : render;
}
function evaluateRenderProp(element, render, props, state) {
  if (render) {
    if (typeof render === "function") {
      if (false) {
        warnIfRenderPropLooksLikeComponent(render);
      }
      return render(props, state);
    }
    const mergedProps = mergeProps(props, render.props);
    mergedProps.ref = props.ref;
    if (false) {
      if (!/* @__PURE__ */ isValidElement(render)) {
        throw new Error(["Base UI: The `render` prop was provided an invalid React element as `React.isValidElement(render)` is `false`.", "A valid React element must be provided to the `render` prop because it is cloned with props to replace the default element.", "https://base-ui.com/r/invalid-render-prop"].join("\n"));
      }
    }
    return /* @__PURE__ */ cloneElement(render, mergedProps);
  }
  return renderTag(element, props);
}
function renderTag(Tag, props) {
  if (Tag === "button") {
    return /* @__PURE__ */ createElement("button", {
      type: "button",
      ...props,
      key: props.key
    });
  }
  if (Tag === "img") {
    return /* @__PURE__ */ createElement("img", {
      alt: "",
      ...props,
      key: props.key
    });
  }
  return /* @__PURE__ */ createElement(Tag, props);
}

// node_modules/@base-ui/react/internals/TransitionStatusDataAttributes.mjs
var startingStyle = "data-starting-style";
var endingStyle = "data-ending-style";

// node_modules/@base-ui/react/internals/stateAttributesMapping.mjs
var STARTING_HOOK = {
  [startingStyle]: ""
};
var ENDING_HOOK = {
  [endingStyle]: ""
};
var transitionStatusMapping = {
  transitionStatus(value) {
    if (value === "starting") {
      return STARTING_HOOK;
    }
    if (value === "ending") {
      return ENDING_HOOK;
    }
    return null;
  }
};

// node_modules/@base-ui/react/utils/CommonPopupDataAttributes.mjs
var open = "data-open";
var closed = "data-closed";
var anchorHidden = "data-anchor-hidden";

// node_modules/@base-ui/react/utils/CommonTriggerDataAttributes.mjs
var CommonTriggerDataAttributes_exports = {};
__export(CommonTriggerDataAttributes_exports, {
  popupOpen: () => popupOpen,
  pressed: () => pressed
});
var popupOpen = "data-popup-open";
var pressed = "data-pressed";

// node_modules/@base-ui/react/utils/popupStateMapping.mjs
var TRIGGER_HOOK = {
  [popupOpen]: ""
};
var PRESSABLE_TRIGGER_HOOK = {
  [popupOpen]: "",
  [pressed]: ""
};
var POPUP_OPEN_HOOK = {
  [open]: ""
};
var POPUP_CLOSED_HOOK = {
  [closed]: ""
};
var ANCHOR_HIDDEN_HOOK = {
  [anchorHidden]: ""
};
var triggerOpenStateMapping = {
  open(value) {
    if (value) {
      return TRIGGER_HOOK;
    }
    return null;
  }
};
var pressableTriggerOpenStateMapping = {
  open(value) {
    if (value) {
      return PRESSABLE_TRIGGER_HOOK;
    }
    return null;
  }
};
var popupStateMapping = {
  open(value) {
    if (value) {
      return POPUP_OPEN_HOOK;
    }
    return POPUP_CLOSED_HOOK;
  },
  anchorHidden(value) {
    if (value) {
      return ANCHOR_HIDDEN_HOOK;
    }
    return null;
  }
};
var popupTransitionStateMapping = {
  ...popupStateMapping,
  ...transitionStatusMapping
};

// node_modules/@base-ui/react/menu/arrow/MenuArrow.mjs
var MenuArrow = /* @__PURE__ */ forwardRef(function MenuArrow2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useMenuRootContext();
  const {
    arrowRef,
    side,
    align,
    arrowUncentered,
    arrowStyles
  } = useMenuPositionerContext();
  const open2 = store.useState("open");
  const state = {
    open: open2,
    side,
    align,
    uncentered: arrowUncentered
  };
  return useRenderElement("div", componentProps, {
    ref: [arrowRef, forwardedRef],
    stateAttributesMapping: popupStateMapping,
    state,
    props: {
      style: arrowStyles,
      "aria-hidden": true,
      ...elementProps
    }
  });
});
if (false) MenuArrow.displayName = "MenuArrow";

// node_modules/@base-ui/react/menu/backdrop/MenuBackdrop.mjs
init_react();

// node_modules/@base-ui/react/context-menu/root/ContextMenuRootContext.mjs
init_react();
var ContextMenuRootContext = /* @__PURE__ */ createContext(void 0);
if (false) ContextMenuRootContext.displayName = "ContextMenuRootContext";
function useContextMenuRootContext(optional = true) {
  const context = useContext(ContextMenuRootContext);
  if (context === void 0 && !optional) {
    throw new Error(false ? "Base UI: ContextMenuRootContext is missing. ContextMenu parts must be placed within <ContextMenu.Root>." : formatErrorMessage_default(25));
  }
  return context;
}

// node_modules/@base-ui/react/internals/reason-parts.mjs
var reason_parts_exports = {};
__export(reason_parts_exports, {
  cancelOpen: () => cancelOpen,
  chipRemovePress: () => chipRemovePress,
  clearPress: () => clearPress,
  closePress: () => closePress,
  closeWatcher: () => closeWatcher,
  decrementPress: () => decrementPress,
  disabled: () => disabled,
  drag: () => drag,
  escapeKey: () => escapeKey,
  focusOut: () => focusOut,
  imperativeAction: () => imperativeAction,
  incrementPress: () => incrementPress,
  initial: () => initial,
  inputBlur: () => inputBlur,
  inputChange: () => inputChange,
  inputClear: () => inputClear,
  inputPaste: () => inputPaste,
  inputPress: () => inputPress,
  itemPress: () => itemPress,
  keyboard: () => keyboard,
  linkPress: () => linkPress,
  listNavigation: () => listNavigation,
  missing: () => missing,
  none: () => none,
  outsidePress: () => outsidePress,
  pointer: () => pointer,
  popupClose: () => popupClose,
  scrub: () => scrub,
  siblingOpen: () => siblingOpen,
  swipe: () => swipe,
  trackPress: () => trackPress,
  triggerFocus: () => triggerFocus,
  triggerHover: () => triggerHover,
  triggerPress: () => triggerPress,
  wheel: () => wheel,
  windowResize: () => windowResize
});
var none = "none";
var triggerPress = "trigger-press";
var triggerHover = "trigger-hover";
var triggerFocus = "trigger-focus";
var outsidePress = "outside-press";
var itemPress = "item-press";
var closePress = "close-press";
var linkPress = "link-press";
var clearPress = "clear-press";
var chipRemovePress = "chip-remove-press";
var trackPress = "track-press";
var incrementPress = "increment-press";
var decrementPress = "decrement-press";
var inputChange = "input-change";
var inputClear = "input-clear";
var inputBlur = "input-blur";
var inputPaste = "input-paste";
var inputPress = "input-press";
var focusOut = "focus-out";
var escapeKey = "escape-key";
var closeWatcher = "close-watcher";
var listNavigation = "list-navigation";
var keyboard = "keyboard";
var pointer = "pointer";
var drag = "drag";
var wheel = "wheel";
var scrub = "scrub";
var popupClose = "popup-close";
var cancelOpen = "cancel-open";
var siblingOpen = "sibling-open";
var disabled = "disabled";
var missing = "missing";
var initial = "initial";
var imperativeAction = "imperative-action";
var swipe = "swipe";
var windowResize = "window-resize";

// node_modules/@base-ui/react/menu/backdrop/MenuBackdrop.mjs
var MenuBackdrop = /* @__PURE__ */ forwardRef(function MenuBackdrop2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useMenuRootContext();
  const open2 = store.useState("open");
  const mounted = store.useState("mounted");
  const transitionStatus = store.useState("transitionStatus");
  const lastOpenChangeReason = store.useState("lastOpenChangeReason");
  const contextMenuContext = useContextMenuRootContext();
  const state = {
    open: open2,
    transitionStatus
  };
  return useRenderElement("div", componentProps, {
    ref: contextMenuContext?.backdropRef ? [forwardedRef, contextMenuContext.backdropRef] : forwardedRef,
    state,
    stateAttributesMapping: popupTransitionStateMapping,
    props: [{
      role: "presentation",
      hidden: !mounted,
      style: {
        pointerEvents: lastOpenChangeReason === reason_parts_exports.triggerHover ? "none" : void 0,
        userSelect: "none",
        WebkitUserSelect: "none"
      }
    }, elementProps]
  });
});
if (false) MenuBackdrop.displayName = "MenuBackdrop";

// node_modules/@base-ui/react/menu/checkbox-item/MenuCheckboxItem.mjs
init_react();

// node_modules/@base-ui/utils/useControlled.mjs
init_react();
function useControlled({
  controlled,
  default: defaultProp,
  name,
  state = "value"
}) {
  const {
    current: isControlled
  } = useRef(controlled !== void 0);
  const [valueState, setValue] = useState(() => defaultProp);
  const value = isControlled && controlled !== void 0 ? controlled : valueState;
  if (false) {
    useEffect(() => {
      if (isControlled !== (controlled !== void 0)) {
        error([`A component is changing the ${isControlled ? "" : "un"}controlled ${state} state of ${name} to be ${isControlled ? "un" : ""}controlled.`, "Elements should not switch from uncontrolled to controlled (or vice versa).", `Decide between using a controlled or uncontrolled ${name} element for the lifetime of the component.`, "The nature of the state is determined during the first render. It's considered controlled if the value is not `undefined`.", "More info: https://fb.me/react-controlled-components"].join("\n"));
      }
    }, [state, name, controlled]);
    const {
      current: defaultValue
    } = useRef(defaultProp);
    useEffect(() => {
      if (!isControlled && serializeToDevModeString(defaultValue) !== serializeToDevModeString(defaultProp)) {
        error([`A component is changing the default ${state} state of an uncontrolled ${name} after being initialized. To suppress this warning opt to use a controlled ${name}.`].join("\n"));
      }
    }, [defaultProp]);
  }
  const setValueIfUncontrolled = useCallback((newValue) => {
    if (!isControlled) {
      setValue(newValue);
    }
  }, []);
  return [value, setValueIfUncontrolled];
}

// node_modules/@base-ui/react/menu/filter-root/MenuFilterContext.mjs
init_react();
var MenuFilterImplContext = /* @__PURE__ */ createContext(null);
if (false) MenuFilterImplContext.displayName = "MenuFilterImplContext";
function useMenuFilterImpl(scope = "root") {
  const impl = useContext(MenuFilterImplContext);
  const root = useContext(MenuRootContext);
  if (impl === null || root === void 0) {
    return null;
  }
  const filterable = scope === "submenu-trigger" ? root.virtualFocus || root.parentVirtualFocus : root.virtualFocus;
  return filterable ? impl : null;
}
function useMenuFilterPart(part) {
  if (useMenuFilterImpl() === null) {
    throw new Error(false ? `Base UI: <Menu.${part}> must be placed in a menu wrapped in <Menu.FilterProvider>. It reads the filter query and the matching items from the provider, which a plain menu does not have. Wrap the <Menu.Root> or <Menu.SubmenuRoot> it belongs to in <Menu.FilterProvider>. See https://base-ui.com/react/components/menu#filtering` : formatErrorMessage_default(104, part));
  }
}
var UNFILTERED = {
  visible: true,
  ref: null
};
function useUnfilteredItem() {
  return UNFILTERED;
}
function useMenuFilterItem(props, forwardedRef, scope = "root") {
  const impl = useMenuFilterImpl(scope);
  const useItem = (scope === "submenu-trigger" ? impl?.useSubmenuTrigger : impl?.useItem) ?? useUnfilteredItem;
  const item = useItem({
    label: props.label,
    children: props.children,
    render: props.render
  });
  const ref = useMergedRefs(forwardedRef, item.ref);
  return {
    visible: item.visible,
    ref,
    props: item.props
  };
}

// node_modules/@base-ui/react/menu/checkbox-item/MenuCheckboxItemContext.mjs
init_react();
var MenuCheckboxItemContext = /* @__PURE__ */ createContext(void 0);
if (false) MenuCheckboxItemContext.displayName = "MenuCheckboxItemContext";
function useMenuCheckboxItemContext() {
  const context = useContext(MenuCheckboxItemContext);
  if (context === void 0) {
    throw new Error(false ? "Base UI: MenuCheckboxItemContext is missing. MenuCheckboxItem parts must be placed within <Menu.CheckboxItem>." : formatErrorMessage_default(30));
  }
  return context;
}

// node_modules/@base-ui/react/menu/item/useMenuItem.mjs
init_react();

// node_modules/@base-ui/react/internals/use-button/useButton.mjs
init_react();

// node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
function hasWindow() {
  return typeof window !== "undefined";
}
function getNodeName(node) {
  if (isNode(node)) {
    return (node.nodeName || "").toLowerCase();
  }
  return "#document";
}
function getWindow(node) {
  var _node$ownerDocument;
  return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
}
function getDocumentElement(node) {
  var _ref;
  return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
}
function isNode(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof Node || value instanceof getWindow(value).Node;
}
function isElement(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof Element || value instanceof getWindow(value).Element;
}
function isHTMLElement(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
}
function isShadowRoot(value) {
  if (!hasWindow() || typeof ShadowRoot === "undefined") {
    return false;
  }
  return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
}
function isOverflowElement(element) {
  const {
    overflow,
    overflowX,
    overflowY,
    display
  } = getComputedStyle2(element);
  return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== "inline" && display !== "contents";
}
function isTableElement(element) {
  return /^(table|td|th)$/.test(getNodeName(element));
}
function isTopLayer(element) {
  try {
    if (element.matches(":popover-open")) {
      return true;
    }
  } catch (_e) {
  }
  try {
    return element.matches(":modal");
  } catch (_e) {
    return false;
  }
}
var willChangeRe = /transform|translate|scale|rotate|perspective|filter/;
var containRe = /paint|layout|strict|content/;
var isNotNone = (value) => !!value && value !== "none";
var isWebKitValue;
function isContainingBlock(elementOrCss) {
  const css = isElement(elementOrCss) ? getComputedStyle2(elementOrCss) : elementOrCss;
  return isNotNone(css.transform) || isNotNone(css.translate) || isNotNone(css.scale) || isNotNone(css.rotate) || isNotNone(css.perspective) || !isWebKit() && (isNotNone(css.backdropFilter) || isNotNone(css.filter)) || willChangeRe.test(css.willChange || "") || containRe.test(css.contain || "");
}
function getContainingBlock(element) {
  let currentNode = getParentNode(element);
  while (isHTMLElement(currentNode) && !isLastTraversableNode(currentNode)) {
    if (isContainingBlock(currentNode)) {
      return currentNode;
    } else if (isTopLayer(currentNode)) {
      return null;
    }
    currentNode = getParentNode(currentNode);
  }
  return null;
}
function isWebKit() {
  if (isWebKitValue == null) {
    isWebKitValue = typeof CSS !== "undefined" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none");
  }
  return isWebKitValue;
}
function isLastTraversableNode(node) {
  return /^(html|body|#document)$/.test(getNodeName(node));
}
function getComputedStyle2(element) {
  return getWindow(element).getComputedStyle(element);
}
function getNodeScroll(element) {
  if (isElement(element)) {
    return {
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop
    };
  }
  return {
    scrollLeft: element.scrollX,
    scrollTop: element.scrollY
  };
}
function getParentNode(node) {
  if (getNodeName(node) === "html") {
    return node;
  }
  const result = (
    // Step into the shadow DOM of the parent of a slotted node.
    node.assignedSlot || // DOM Element detected.
    node.parentNode || // ShadowRoot detected.
    isShadowRoot(node) && node.host || // Fallback.
    getDocumentElement(node)
  );
  return isShadowRoot(result) ? result.host : result;
}
function getNearestOverflowAncestor(node) {
  const parentNode = getParentNode(node);
  if (isLastTraversableNode(parentNode)) {
    return (node.ownerDocument || node).body;
  }
  if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) {
    return parentNode;
  }
  return getNearestOverflowAncestor(parentNode);
}
function getOverflowAncestors(node, list, traverseIframes) {
  var _node$ownerDocument2;
  if (list === void 0) {
    list = [];
  }
  if (traverseIframes === void 0) {
    traverseIframes = true;
  }
  const scrollableAncestor = getNearestOverflowAncestor(node);
  const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
  const win = getWindow(scrollableAncestor);
  if (isBody) {
    const frameElement = getFrameElement(win);
    return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
  } else {
    return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
  }
}
function getFrameElement(win) {
  return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
}

// node_modules/@base-ui/utils/safeReact.mjs
init_react();
var SafeReact = {
  ...react_exports
};

// node_modules/@base-ui/utils/useStableCallback.mjs
var useInsertionEffect2 = SafeReact.useInsertionEffect;
var useSafeInsertionEffect = (
  // React 17 doesn't have useInsertionEffect.
  useInsertionEffect2 && // Preact replaces useInsertionEffect with useLayoutEffect and fires too late.
  useInsertionEffect2 !== SafeReact.useLayoutEffect ? useInsertionEffect2 : (fn) => fn()
);
function useStableCallback(callback) {
  const stable = useRefWithInit(createStableCallback).current;
  stable.next = callback;
  useSafeInsertionEffect(stable.effect);
  return stable.trampoline;
}
function createStableCallback() {
  const stable = {
    next: void 0,
    callback: assertNotCalled,
    trampoline: (...args) => stable.callback?.(...args),
    effect: () => {
      stable.callback = stable.next;
    }
  };
  return stable;
}
function assertNotCalled() {
  if (false) {
    throw (
      /* minify-error-disabled */
      new Error("Base UI: Cannot call an event handler while rendering.")
    );
  }
}

// node_modules/@base-ui/utils/useIsoLayoutEffect.mjs
init_react();
var noop = () => {
};
var useIsoLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : noop;

// node_modules/@base-ui/react/internals/composite/root/CompositeRootContext.mjs
init_react();
var CompositeRootContext = /* @__PURE__ */ createContext(void 0);
if (false) CompositeRootContext.displayName = "CompositeRootContext";
function useCompositeRootContext(optional = false) {
  const context = useContext(CompositeRootContext);
  if (context === void 0 && !optional) {
    throw new Error(false ? "Base UI: CompositeRootContext is missing. Composite parts must be placed within <Composite.Root>." : formatErrorMessage_default(16));
  }
  return context;
}

// node_modules/@base-ui/react/utils/useFocusableWhenDisabled.mjs
init_react();
function useFocusableWhenDisabled(parameters) {
  const {
    focusableWhenDisabled,
    disabled: disabled2,
    composite = false,
    tabIndex: tabIndexProp = 0,
    isNativeButton
  } = parameters;
  const isFocusableComposite = composite && focusableWhenDisabled !== false;
  const isNonFocusableComposite = composite && focusableWhenDisabled === false;
  const props = useMemo(() => {
    const additionalProps = {
      // allow Tabbing away from focusableWhenDisabled elements
      onKeyDown(event) {
        if (disabled2 && focusableWhenDisabled && event.key !== "Tab") {
          event.preventDefault();
        }
      }
    };
    if (!composite) {
      additionalProps.tabIndex = tabIndexProp;
      if (!isNativeButton && disabled2) {
        additionalProps.tabIndex = focusableWhenDisabled ? tabIndexProp : -1;
      }
    }
    if (isNativeButton && (focusableWhenDisabled || isFocusableComposite) || !isNativeButton && disabled2) {
      additionalProps["aria-disabled"] = disabled2;
    }
    if (isNativeButton && (!focusableWhenDisabled || isNonFocusableComposite)) {
      additionalProps.disabled = disabled2;
    }
    return additionalProps;
  }, [composite, disabled2, focusableWhenDisabled, isFocusableComposite, isNonFocusableComposite, isNativeButton, tabIndexProp]);
  return {
    props
  };
}

// node_modules/@base-ui/utils/owner.mjs
function ownerDocument(node) {
  return node?.ownerDocument || document;
}

// node_modules/@base-ui/react/utils/dispatchClickWithModifiers.mjs
function dispatchClickWithModifiers(target, sourceEvent, {
  detail = 0,
  pointerType = ""
} = {}) {
  target.dispatchEvent(new (getWindow(target)).PointerEvent("click", {
    bubbles: true,
    cancelable: true,
    composed: true,
    detail,
    pointerType,
    shiftKey: sourceEvent.shiftKey,
    ctrlKey: sourceEvent.ctrlKey,
    altKey: sourceEvent.altKey,
    metaKey: sourceEvent.metaKey
  }));
}

// node_modules/@base-ui/react/internals/use-button/useButton.mjs
function useButton(parameters = {}) {
  const {
    disabled: disabled2 = false,
    focusableWhenDisabled,
    tabIndex = 0,
    native: isNativeButton = true,
    composite: compositeProp
  } = parameters;
  const elementRef = useRef(null);
  const compositeRootContext = useCompositeRootContext(true);
  const isCompositeItem = compositeProp ?? compositeRootContext !== void 0;
  const {
    props: focusableWhenDisabledProps
  } = useFocusableWhenDisabled({
    focusableWhenDisabled,
    disabled: disabled2,
    composite: isCompositeItem,
    tabIndex,
    isNativeButton
  });
  if (false) {
    useEffect(() => {
      if (!elementRef.current) {
        return;
      }
      const isButtonTag = isButtonElement(elementRef.current);
      if (isNativeButton) {
        if (!isButtonTag) {
          const ownerStackMessage = SafeReact.captureOwnerStack?.() || "";
          const message = "A component that acts as a button expected a native <button> because the `nativeButton` prop is true. Rendering a non-<button> removes native button semantics, which can impact forms and accessibility. Use a real <button> in the `render` prop, or set `nativeButton` to `false`.";
          error(`${message}${ownerStackMessage}`);
        }
      } else if (isButtonTag) {
        const ownerStackMessage = SafeReact.captureOwnerStack?.() || "";
        const message = "A component that acts as a button expected a non-<button> because the `nativeButton` prop is false. Rendering a <button> keeps native behavior while Base UI applies non-native attributes and handlers, which can add unintended extra attributes (such as `role` or `aria-disabled`). Use a non-<button> in the `render` prop, or set `nativeButton` to `true`.";
        error(`${message}${ownerStackMessage}`);
      }
    }, [isNativeButton]);
  }
  const updateDisabled = useCallback(() => {
    const element = elementRef.current;
    if (!isButtonElement(element)) {
      return;
    }
    if (isCompositeItem && disabled2 && focusableWhenDisabledProps.disabled === void 0 && element.disabled) {
      element.disabled = false;
    }
  }, [disabled2, focusableWhenDisabledProps.disabled, isCompositeItem]);
  useIsoLayoutEffect(updateDisabled, [updateDisabled]);
  const getButtonProps = useCallback((externalProps = {}) => {
    const {
      onClick: externalOnClick,
      onMouseDown: externalOnMouseDown,
      onKeyUp: externalOnKeyUp,
      onKeyDown: externalOnKeyDown,
      onPointerDown: externalOnPointerDown,
      ...otherExternalProps
    } = externalProps;
    return mergeProps({
      onClick(event) {
        if (disabled2) {
          event.preventDefault();
          return;
        }
        externalOnClick?.(event);
      },
      onMouseDown(event) {
        if (!disabled2) {
          externalOnMouseDown?.(event);
        }
      },
      onKeyDown(event) {
        if (disabled2) {
          return;
        }
        makeEventPreventable(event);
        externalOnKeyDown?.(event);
        if (event.baseUIHandlerPrevented) {
          return;
        }
        const isCurrentTarget = event.target === event.currentTarget;
        const currentTarget = event.currentTarget;
        const isButton = isButtonElement(currentTarget);
        const isLink = !isNativeButton && isValidLinkElement(currentTarget);
        const shouldClick = isCurrentTarget && (isNativeButton ? isButton : !isLink);
        const isEnterKey = event.key === "Enter";
        const isSpaceKey = event.key === " ";
        const role = currentTarget.getAttribute("role");
        const isTextNavigationRole = role?.startsWith("menuitem") || role === "option" || role === "gridcell";
        if (isCurrentTarget && isCompositeItem && isSpaceKey) {
          if (event.defaultPrevented && isTextNavigationRole) {
            return;
          }
          event.preventDefault();
          if (!isNativeButton || isButton) {
            event.preventBaseUIHandler();
            dispatchClickWithModifiers(currentTarget, event);
          }
          return;
        }
        if (!shouldClick || isNativeButton || !isSpaceKey && !isEnterKey) {
          if (isCurrentTarget && isLink && isSpaceKey) {
            event.preventDefault();
          }
          return;
        }
        if (event.defaultPrevented) {
          return;
        }
        event.preventDefault();
        if (isEnterKey) {
          event.preventBaseUIHandler();
          dispatchClickWithModifiers(currentTarget, event);
        }
      },
      onKeyUp(event) {
        if (disabled2) {
          return;
        }
        makeEventPreventable(event);
        externalOnKeyUp?.(event);
        if (event.target === event.currentTarget && isNativeButton && isCompositeItem && isButtonElement(event.currentTarget) && event.key === " ") {
          event.preventDefault();
          return;
        }
        if (event.baseUIHandlerPrevented) {
          return;
        }
        if (event.target === event.currentTarget && !isNativeButton && !isCompositeItem && !event.defaultPrevented && event.key === " ") {
          event.preventBaseUIHandler();
          dispatchClickWithModifiers(event.currentTarget, event);
        }
      },
      onPointerDown(event) {
        if (disabled2) {
          event.preventDefault();
          return;
        }
        externalOnPointerDown?.(event);
      }
    }, isNativeButton ? {
      type: "button"
    } : {
      role: "button"
    }, focusableWhenDisabledProps, otherExternalProps);
  }, [disabled2, focusableWhenDisabledProps, isCompositeItem, isNativeButton]);
  const buttonRef = useStableCallback((element) => {
    elementRef.current = element;
    updateDisabled();
  });
  return {
    getButtonProps,
    buttonRef
  };
}
function isButtonElement(elem) {
  return isHTMLElement(elem) && elem.tagName === "BUTTON";
}
function isValidLinkElement(elem) {
  return isHTMLElement(elem) && elem.tagName === "A" && Boolean(elem.href);
}

// node_modules/@base-ui/react/menu/item/useMenuItemCommonProps.mjs
init_react();

// node_modules/@base-ui/utils/platform/parts.mjs
var parts_exports = {};
__export(parts_exports, {
  engine: () => engine_exports,
  env: () => env_exports,
  mediaQuery: () => media_query_exports,
  os: () => os_exports,
  screenReader: () => screen_reader_exports
});

// node_modules/@base-ui/utils/platform/os.mjs
var os_exports = {};
__export(os_exports, {
  android: () => android,
  apple: () => apple,
  ios: () => ios,
  linux: () => linux,
  mac: () => mac,
  windows: () => windows
});

// node_modules/@base-ui/utils/platform/shared.mjs
function readRawData() {
  if (typeof navigator === "undefined") {
    return {
      userAgent: "",
      platform: "",
      maxTouchPoints: 0
    };
  }
  if (false) {
    const uaData = navigator.userAgentData;
    if (uaData && Array.isArray(uaData.brands)) {
      return {
        userAgent: uaData.brands.map(({
          brand,
          version: version3
        }) => `${brand}/${version3}`).join(" "),
        platform: uaData.platform ?? navigator.platform ?? "",
        maxTouchPoints: navigator.maxTouchPoints ?? 0
      };
    }
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform ?? "",
    maxTouchPoints: navigator.maxTouchPoints ?? 0
  };
}
var {
  userAgent,
  platform,
  maxTouchPoints
} = readRawData();
var lowerUserAgent = userAgent.toLowerCase();
var lowerPlatform = platform.toLowerCase();

// node_modules/@base-ui/utils/platform/os.mjs
var ios = /^i(os$|p)/.test(lowerPlatform) || lowerPlatform === "macintel" && maxTouchPoints > 1;
var ANDROID_STRING = "android";
var android = lowerPlatform === ANDROID_STRING || lowerUserAgent.includes(ANDROID_STRING);
var mac = !ios && lowerPlatform.startsWith("mac");
var windows = lowerPlatform.startsWith("win");
var linux = !android && /^(linux|chrome os)/.test(lowerPlatform);
var apple = mac || ios;

// node_modules/@base-ui/utils/platform/engine.mjs
var engine_exports = {};
__export(engine_exports, {
  blink: () => blink,
  gecko: () => gecko,
  webkit: () => webkit
});
var webkit = typeof CSS !== "undefined" && !!CSS.supports?.("-webkit-backdrop-filter:none");
var gecko = !webkit && lowerUserAgent.includes("firefox");
var blink = !webkit && lowerUserAgent.includes("chrom");

// node_modules/@base-ui/utils/platform/screen-reader.mjs
var screen_reader_exports = {};
__export(screen_reader_exports, {
  voiceOver: () => voiceOver
});
var voiceOver = apple;

// node_modules/@base-ui/utils/platform/env.mjs
var env_exports = {};
__export(env_exports, {
  jsdom: () => jsdom
});
var jsdom = /jsdom|happydom/.test(lowerUserAgent);

// node_modules/@base-ui/utils/platform/media-query.mjs
var media_query_exports = {};
__export(media_query_exports, {
  iOS: () => iOS
});
var iOS = "@supports (-webkit-touch-callout: none)";

// node_modules/@base-ui/react/menu/item/useMenuItemCommonProps.mjs
function preventMouseDownDefault(event) {
  event.preventDefault();
}
function useMenuItemCommonProps(params) {
  const {
    closeOnClick,
    highlighted,
    id,
    nodeId,
    store,
    typingRef,
    itemRef,
    itemMetadata
  } = params;
  const rootContext = useMenuRootContext();
  const contextMenuContext = useContextMenuRootContext(true);
  const isSubmenuTrigger = itemMetadata.type === "submenu-trigger";
  const virtualFocus = isSubmenuTrigger ? rootContext.parentVirtualFocus : rootContext.virtualFocus;
  const selectionStore = isSubmenuTrigger && rootContext.parent.type === "menu" ? rootContext.parent.store : rootContext.store;
  const ariaSelected = selectionStore.useState("webkitAriaSelected", highlighted);
  const {
    events: menuEvents
  } = store.useState("floatingTreeRoot");
  const open2 = store.useState("open");
  const isContextMenu = contextMenuContext !== void 0;
  const tabIndex = !virtualFocus && open2 && highlighted ? 0 : -1;
  return useMemo(() => ({
    id,
    role: "menuitem",
    tabIndex,
    "aria-selected": ariaSelected,
    // Real focus stays on the input or list that owns virtual navigation.
    onMouseDown: virtualFocus ? preventMouseDownDefault : void 0,
    onKeyDown(event) {
      if (event.key === " " && typingRef?.current) {
        event.preventDefault();
      }
    },
    onMouseMove(event) {
      if (!nodeId) {
        return;
      }
      menuEvents.emit("itemhover", {
        nodeId,
        target: event.currentTarget
      });
    },
    onClick(event) {
      if (closeOnClick) {
        menuEvents.emit("close", {
          domEvent: event.nativeEvent,
          reason: reason_parts_exports.itemPress
        });
      }
    },
    onMouseUp(event) {
      if (contextMenuContext) {
        const initialCursorPoint = contextMenuContext.initialCursorPointRef.current;
        contextMenuContext.initialCursorPointRef.current = null;
        if (isContextMenu && initialCursorPoint && Math.abs(event.clientX - initialCursorPoint.x) <= 1 && Math.abs(event.clientY - initialCursorPoint.y) <= 1) {
          return;
        }
        if (isContextMenu && !parts_exports.os.mac && event.button === 2) {
          return;
        }
      }
      if (itemRef.current && store.context.allowMouseUpTriggerRef.current && (!isContextMenu || event.button === 2)) {
        if (itemMetadata.type === "regular-item") {
          dispatchClickWithModifiers(itemRef.current, event, {
            detail: 1,
            pointerType: "mouse"
          });
        }
      }
    }
  }), [closeOnClick, tabIndex, id, menuEvents, nodeId, store.context.allowMouseUpTriggerRef, typingRef, itemRef, contextMenuContext, isContextMenu, itemMetadata.type, ariaSelected, virtualFocus]);
}

// node_modules/@base-ui/react/menu/item/useMenuItem.mjs
var REGULAR_ITEM = {
  type: "regular-item"
};
function useMenuItem(params) {
  const {
    closeOnClick,
    disabled: disabled2,
    highlighted,
    id,
    store,
    typingRef = store.context.typingRef,
    nativeButton,
    itemMetadata,
    nodeId
  } = params;
  const itemRef = useRef(null);
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled: disabled2,
    focusableWhenDisabled: true,
    native: nativeButton,
    composite: true
  });
  const commonProps = useMenuItemCommonProps({
    closeOnClick,
    highlighted,
    id,
    nodeId,
    store,
    typingRef,
    itemRef,
    itemMetadata
  });
  const getItemProps = useCallback((externalProps) => {
    return mergeProps(commonProps, {
      onMouseEnter(event) {
        if (itemMetadata.type !== "submenu-trigger") {
          return;
        }
        itemMetadata.setActive(event.nativeEvent);
      }
    }, externalProps, getButtonProps);
  }, [commonProps, getButtonProps, itemMetadata]);
  const mergedRef = useMergedRefs(itemRef, buttonRef);
  return useMemo(() => ({
    getItemProps,
    itemRef: mergedRef
  }), [getItemProps, mergedRef]);
}

// node_modules/@base-ui/react/internals/composite/list/useCompositeListItem.mjs
init_react();

// node_modules/@base-ui/react/internals/composite/list/CompositeListContext.mjs
init_react();
var CompositeListContext = /* @__PURE__ */ createContext({
  register: () => {
  },
  unregister: () => {
  },
  subscribeMapChange: () => () => {
  },
  nextIndexRef: {
    current: 0
  }
});
if (false) CompositeListContext.displayName = "CompositeListContext";
function useCompositeListContext() {
  return useContext(CompositeListContext);
}

// node_modules/@base-ui/react/internals/composite/list/useCompositeListItem.mjs
function useCompositeListItem(params = {}) {
  const {
    guess,
    label,
    metadata,
    textRef,
    index: externalIndex
  } = params;
  const {
    register: register2,
    unregister,
    subscribeMapChange,
    nextIndexRef
  } = useCompositeListContext();
  const indexRef = useRef(-1);
  const [internalIndex, setInternalIndex] = useState(externalIndex == null && guess ? () => {
    if (indexRef.current === -1) {
      const newIndex = nextIndexRef.current;
      nextIndexRef.current += 1;
      indexRef.current = newIndex;
    }
    return indexRef.current;
  } : -1);
  const index2 = externalIndex ?? internalIndex;
  const componentRef = useRef(null);
  const ref = useCallback((node) => {
    const previousNode = componentRef.current;
    if (previousNode) {
      unregister(previousNode);
    }
    componentRef.current = node;
    if (node) {
      register2(node, {
        metadata: metadata ?? null,
        index: externalIndex ?? null,
        label,
        textRef
      });
    }
  }, [externalIndex, register2, unregister, metadata, label, textRef]);
  useIsoLayoutEffect(() => {
    if (externalIndex != null) {
      return void 0;
    }
    return subscribeMapChange((map) => {
      const i = componentRef.current ? map.get(componentRef.current)?.index : null;
      if (i != null) {
        setInternalIndex(i);
      }
    });
  }, [externalIndex, subscribeMapChange]);
  return {
    ref,
    index: index2
  };
}

// node_modules/@base-ui/utils/useId.mjs
init_react();

// node_modules/@base-ui/utils/useForcedRerendering.mjs
init_react();
function useForcedRerendering() {
  const [, setState] = useState({});
  return useCallback(() => {
    setState({});
  }, []);
}

// node_modules/@base-ui/utils/useId.mjs
var globalId = 0;
function useGlobalId(idOverride, prefix = "mui") {
  const defaultId = useRef(void 0);
  const forceRerender = useForcedRerendering();
  const id = idOverride ?? defaultId.current;
  useEffect(() => {
    if (defaultId.current == null) {
      globalId += 1;
      defaultId.current = `${prefix}-${globalId}`;
      if (idOverride == null) {
        forceRerender();
      }
    }
  }, [idOverride, prefix, forceRerender]);
  return id;
}
var maybeReactUseId = SafeReact.useId;
function useId2(idOverride, prefix) {
  if (maybeReactUseId !== void 0) {
    const reactId = maybeReactUseId();
    return idOverride ?? (prefix ? `${prefix}-${reactId}` : reactId);
  }
  return useGlobalId(idOverride, prefix);
}

// node_modules/@base-ui/react/internals/useBaseUiId.mjs
function useBaseUiId(idOverride) {
  return useId2(idOverride, "base-ui");
}

// node_modules/@base-ui/react/menu/checkbox-item/MenuCheckboxItemDataAttributes.mjs
var checked = "data-checked";
var unchecked = "data-unchecked";

// node_modules/@base-ui/react/menu/utils/stateAttributesMapping.mjs
var itemMapping = {
  checked(value) {
    if (value) {
      return {
        [checked]: ""
      };
    }
    return {
      [unchecked]: ""
    };
  },
  ...transitionStatusMapping
};

// node_modules/@base-ui/react/internals/createBaseUIEventDetails.mjs
function createChangeEventDetails(reason, event, trigger, customProperties) {
  let canceled = false;
  let allowPropagation = false;
  const custom = customProperties ?? EMPTY_OBJECT;
  const details = {
    reason,
    event: event ?? new Event("base-ui"),
    cancel() {
      canceled = true;
    },
    allowPropagation() {
      allowPropagation = true;
    },
    get isCanceled() {
      return canceled;
    },
    get isPropagationAllowed() {
      return allowPropagation;
    },
    trigger,
    ...custom
  };
  return details;
}
function createGenericEventDetails(reason, event, customProperties) {
  const custom = customProperties ?? EMPTY_OBJECT;
  const details = {
    reason,
    event: event ?? new Event("base-ui"),
    ...custom
  };
  return details;
}

// owner-react:react/jsx-runtime
import { JSXRuntime as runtime2 } from "../react/index.js";
var { Fragment: Fragment2, jsx, jsxs } = runtime2;

// node_modules/@base-ui/react/menu/checkbox-item/MenuCheckboxItem.mjs
var MenuCheckboxItemPlain = /* @__PURE__ */ forwardRef(function MenuCheckboxItemPlain2(componentProps, forwardedRef) {
  const {
    render,
    className,
    id: idProp,
    label,
    nativeButton = false,
    disabled: disabledProp = false,
    closeOnClick = false,
    checked: checked4 = false,
    onCheckedChange,
    style,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useMenuRootContext();
  const listItem = useCompositeListItem({
    guess: true,
    label
  });
  const id = useBaseUiId(idProp);
  const rootDisabled = store.useState("disabled");
  const highlighted = store.useState("isActive", listItem.index);
  const nodeId = store.useState("floatingNodeId");
  const itemProps = store.useState("itemProps");
  const disabled2 = disabledProp || rootDisabled;
  const {
    getItemProps,
    itemRef
  } = useMenuItem({
    closeOnClick,
    disabled: disabled2,
    highlighted,
    id,
    store,
    nativeButton,
    nodeId,
    itemMetadata: REGULAR_ITEM
  });
  const state = useMemo(() => ({
    disabled: disabled2,
    highlighted,
    checked: checked4
  }), [disabled2, highlighted, checked4]);
  function handleClick(event) {
    const details = createChangeEventDetails(reason_parts_exports.itemPress, event.nativeEvent, void 0, {
      preventUnmountOnClose: NOOP
    });
    onCheckedChange?.(!checked4, details);
  }
  const element = useRenderElement("div", componentProps, {
    state,
    stateAttributesMapping: itemMapping,
    props: [itemProps, {
      role: "menuitemcheckbox",
      "aria-checked": checked4,
      onClick: handleClick
    }, elementProps, getItemProps],
    ref: [itemRef, forwardedRef, listItem.ref]
  });
  return /* @__PURE__ */ jsx(MenuCheckboxItemContext.Provider, {
    value: state,
    children: element
  });
});
if (false) MenuCheckboxItemPlain.displayName = "MenuCheckboxItemPlain";
var MenuCheckboxItem = /* @__PURE__ */ forwardRef(function MenuCheckboxItem2(props, forwardedRef) {
  const {
    checked: checkedProp,
    defaultChecked,
    onCheckedChange,
    ...plainProps
  } = props;
  const [checked4, setChecked] = useControlled({
    controlled: checkedProp,
    default: defaultChecked ?? false,
    name: "MenuCheckboxItem",
    state: "checked"
  });
  const filterItem = useMenuFilterItem(props, forwardedRef);
  function handleCheckedChange(nextChecked, eventDetails) {
    onCheckedChange?.(nextChecked, eventDetails);
    if (!eventDetails.isCanceled) {
      setChecked(nextChecked);
    }
  }
  if (!filterItem.visible) {
    return null;
  }
  return /* @__PURE__ */ jsx(MenuCheckboxItemPlain, {
    ...plainProps,
    checked: checked4,
    onCheckedChange: handleCheckedChange,
    ref: filterItem.ref
  });
});
if (false) MenuCheckboxItem.displayName = "MenuCheckboxItem";

// node_modules/@base-ui/react/menu/checkbox-item-indicator/MenuCheckboxItemIndicator.mjs
init_react();

// node_modules/@base-ui/react/internals/useTransitionStatus.mjs
init_react();

// node_modules/@base-ui/utils/useOnMount.mjs
init_react();
function useOnMount(fn) {
  useEffect(fn, EMPTY_ARRAY);
}

// node_modules/@base-ui/utils/useAnimationFrame.mjs
var EMPTY = null;
var LAST_RAF = globalThis.requestAnimationFrame;
var Scheduler = class {
  /* This implementation uses an array as a backing data-structure for frame callbacks.
   * It allows `O(1)` callback cancelling by inserting a `null` in the array, though it
   * never calls the native `cancelAnimationFrame` if there are no frames left. This can
   * be much more efficient if there is a call pattern that alterns as
   * "request-cancel-request-cancel-…".
   * But in the case of "request-request-…-cancel-cancel-…", it leaves the final animation
   * frame to run anyway. We turn that frame into a `O(1)` no-op via `callbacksCount`. */
  callbacks = [];
  callbacksCount = 0;
  nextId = 1;
  startId = 1;
  isScheduled = false;
  tick = (timestamp) => {
    this.isScheduled = false;
    const currentCallbacks = this.callbacks;
    const currentCallbacksCount = this.callbacksCount;
    this.callbacks = [];
    this.callbacksCount = 0;
    this.startId = this.nextId;
    if (currentCallbacksCount > 0) {
      for (let i = 0; i < currentCallbacks.length; i += 1) {
        currentCallbacks[i]?.(timestamp);
      }
    }
  };
  request(fn) {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.push(fn);
    this.callbacksCount += 1;
    const didRAFChange = false;
    if (!this.isScheduled || didRAFChange) {
      requestAnimationFrame(this.tick);
      this.isScheduled = true;
    }
    return id;
  }
  cancel(id) {
    const index2 = id - this.startId;
    if (index2 < 0 || index2 >= this.callbacks.length) {
      return;
    }
    if (this.callbacks[index2] === null) {
      return;
    }
    this.callbacks[index2] = null;
    this.callbacksCount -= 1;
  }
};
var scheduler = new Scheduler();
var AnimationFrame = class _AnimationFrame {
  static create() {
    return new _AnimationFrame();
  }
  static request(fn) {
    return scheduler.request(fn);
  }
  static cancel(id) {
    return scheduler.cancel(id);
  }
  currentId = EMPTY;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  request(fn) {
    this.cancel();
    this.currentId = scheduler.request(() => {
      this.currentId = EMPTY;
      fn();
    });
  }
  cancel = () => {
    if (this.currentId !== EMPTY) {
      scheduler.cancel(this.currentId);
      this.currentId = EMPTY;
    }
  };
  disposeEffect = () => {
    return this.cancel;
  };
};
function useAnimationFrame() {
  const timeout = useRefWithInit(AnimationFrame.create).current;
  useOnMount(timeout.disposeEffect);
  return timeout;
}

// node_modules/@base-ui/react/internals/useTransitionStatus.mjs
function useTransitionStatus(open2, enableIdleState = false, deferEndingState = false, animateInitialOpen = false) {
  const [transitionStatus, setTransitionStatus] = useState(open2 && enableIdleState ? "idle" : void 0);
  const [mounted, setMounted] = useState(open2 && !animateInitialOpen);
  if (open2 && !mounted) {
    setMounted(true);
    setTransitionStatus("starting");
  }
  if (!open2 && mounted && transitionStatus !== "ending" && !deferEndingState) {
    setTransitionStatus("ending");
  }
  if (!open2 && !mounted && transitionStatus === "ending") {
    setTransitionStatus(void 0);
  }
  useIsoLayoutEffect(() => {
    if (!open2 && mounted && transitionStatus !== "ending" && deferEndingState) {
      const frame = AnimationFrame.request(() => {
        setTransitionStatus("ending");
      });
      return () => {
        AnimationFrame.cancel(frame);
      };
    }
    return void 0;
  }, [open2, mounted, transitionStatus, deferEndingState]);
  useIsoLayoutEffect(() => {
    if (!open2 || enableIdleState || transitionStatus === void 0) {
      return void 0;
    }
    const frame = AnimationFrame.request(() => {
      setTransitionStatus(void 0);
    });
    return () => {
      AnimationFrame.cancel(frame);
    };
  }, [enableIdleState, open2, transitionStatus]);
  useIsoLayoutEffect(() => {
    if (!open2 || !enableIdleState) {
      return void 0;
    }
    if (open2 && mounted && transitionStatus !== "idle") {
      setTransitionStatus("starting");
    }
    const frame = AnimationFrame.request(() => {
      setTransitionStatus("idle");
    });
    return () => {
      AnimationFrame.cancel(frame);
    };
  }, [enableIdleState, open2, mounted, transitionStatus]);
  return {
    mounted,
    setMounted,
    transitionStatus
  };
}

// node_modules/@base-ui/react/internals/useOpenChangeComplete.mjs
init_react();

// owner-react:react-dom
import { ReactDOM as runtime3 } from "../react/index.js";
var { __DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, browser, createPortal, flushSync, preconnect, prefetchDNS, preinit, preinitModule, preload, preloadModule, requestFormReset, unstable_batchedUpdates, useFormState, useFormStatus, version: version2 } = runtime3;

// node_modules/@base-ui/react/utils/resolveRef.mjs
function resolveRef(maybeRef) {
  if (maybeRef == null) {
    return maybeRef;
  }
  return "current" in maybeRef ? maybeRef.current : maybeRef;
}

// node_modules/@base-ui/react/utils/getFiniteAnimations.mjs
function getFiniteAnimations(element, options) {
  return element.getAnimations(options).filter((animation) => {
    const timing = animation.effect?.getTiming();
    return timing?.duration !== Infinity && timing?.iterations !== Infinity;
  });
}

// node_modules/@base-ui/react/internals/useAnimationsFinished.mjs
var pendingCallbacks = null;
function flushBeforePaint(fn) {
  if (!pendingCallbacks) {
    const callbacks = [];
    pendingCallbacks = callbacks;
    queueMicrotask(() => {
      pendingCallbacks = null;
      flushSync(() => {
        for (const callback of callbacks) {
          callback();
        }
      });
    });
  }
  pendingCallbacks.push(fn);
}
function useAnimationsFinished(elementOrRef, waitForStartingStyleRemoved = false, batch = false) {
  const frame = useAnimationFrame();
  return useStableCallback((fnToExecute, signal = null) => {
    frame.cancel();
    const element = resolveRef(elementOrRef);
    if (element == null) {
      return;
    }
    const resolvedElement = element;
    const done = () => {
      if (!batch) {
        flushSync(fnToExecute);
        return;
      }
      flushBeforePaint(() => {
        if (!signal?.aborted) {
          fnToExecute();
        }
      });
    };
    if (typeof resolvedElement.getAnimations !== "function" || globalThis.BASE_UI_ANIMATIONS_DISABLED) {
      fnToExecute();
      return;
    }
    function exec() {
      Promise.all(getFiniteAnimations(resolvedElement).map((animation) => animation.finished.then(NOOP))).then(() => {
        if (!signal?.aborted) {
          done();
        }
      }, () => {
        if (signal?.aborted) {
          return;
        }
        const currentAnimations = getFiniteAnimations(resolvedElement);
        if (currentAnimations.some((animation) => animation.pending || animation.playState !== "finished")) {
          exec();
          return;
        }
        done();
      });
    }
    if (waitForStartingStyleRemoved) {
      const startingStyleAttribute = startingStyle;
      if (!resolvedElement.hasAttribute(startingStyleAttribute)) {
        frame.request(exec);
        return;
      }
      const attributeObserver = new MutationObserver(() => {
        if (!resolvedElement.hasAttribute(startingStyleAttribute)) {
          attributeObserver.disconnect();
          exec();
        }
      });
      attributeObserver.observe(resolvedElement, {
        attributes: true,
        attributeFilter: [startingStyleAttribute]
      });
      signal?.addEventListener("abort", () => attributeObserver.disconnect(), {
        once: true
      });
      return;
    }
    frame.request(exec);
  });
}

// node_modules/@base-ui/react/internals/useOpenChangeComplete.mjs
function useOpenChangeComplete(parameters) {
  const {
    enabled = true,
    open: open2,
    ref,
    batch = false,
    onComplete: onCompleteParam
  } = parameters;
  const onComplete = useStableCallback(onCompleteParam);
  const runOnceAnimationsFinish = useAnimationsFinished(ref, open2, batch);
  useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    const abortController = new AbortController();
    runOnceAnimationsFinish(onComplete, abortController.signal);
    return () => {
      abortController.abort();
    };
  }, [enabled, open2, onComplete, runOnceAnimationsFinish]);
}

// node_modules/@base-ui/react/menu/checkbox-item-indicator/MenuCheckboxItemIndicator.mjs
var MenuCheckboxItemIndicator = /* @__PURE__ */ forwardRef(function MenuCheckboxItemIndicator2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    keepMounted = false,
    ...elementProps
  } = componentProps;
  const item = useMenuCheckboxItemContext();
  const indicatorRef = useRef(null);
  const {
    transitionStatus,
    mounted,
    setMounted
  } = useTransitionStatus(item.checked);
  useOpenChangeComplete({
    batch: true,
    enabled: !item.checked,
    open: item.checked,
    ref: indicatorRef,
    onComplete() {
      if (!item.checked) {
        setMounted(false);
      }
    }
  });
  const state = {
    checked: item.checked,
    disabled: item.disabled,
    highlighted: item.highlighted,
    transitionStatus
  };
  const element = useRenderElement("span", componentProps, {
    state,
    ref: [forwardedRef, indicatorRef],
    stateAttributesMapping: itemMapping,
    props: {
      "aria-hidden": true,
      ...elementProps
    },
    enabled: keepMounted || mounted
  });
  return element;
});
if (false) MenuCheckboxItemIndicator.displayName = "MenuCheckboxItemIndicator";

// node_modules/@base-ui/react/menu/group/MenuGroup.mjs
init_react();

// node_modules/@base-ui/react/menu/group/MenuGroupContext.mjs
init_react();
var MenuGroupContext = /* @__PURE__ */ createContext(void 0);
if (false) MenuGroupContext.displayName = "MenuGroupContext";
function useMenuGroupRootContext() {
  const context = useContext(MenuGroupContext);
  if (context === void 0) {
    throw new Error(false ? "Base UI: MenuGroupContext is missing. Menu group parts must be used within <Menu.Group> or <Menu.RadioGroup>." : formatErrorMessage_default(31));
  }
  return context;
}

// node_modules/@base-ui/react/menu/group/MenuGroup.mjs
var MenuGroupPlain = /* @__PURE__ */ forwardRef(function MenuGroupPlain2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const [labelId, setLabelId] = useState(void 0);
  const element = useRenderElement("div", componentProps, {
    ref: forwardedRef,
    props: {
      role: "group",
      "aria-labelledby": labelId,
      ...elementProps
    }
  });
  return /* @__PURE__ */ jsx(MenuGroupContext.Provider, {
    value: setLabelId,
    children: element
  });
});
if (false) MenuGroupPlain.displayName = "MenuGroupPlain";
var MenuGroup = /* @__PURE__ */ forwardRef(function MenuGroup2(props, forwardedRef) {
  const Group = useMenuFilterImpl()?.Group ?? MenuGroupPlain;
  return /* @__PURE__ */ jsx(Group, {
    ...props,
    ref: forwardedRef
  });
});
if (false) MenuGroup.displayName = "MenuGroup";

// node_modules/@base-ui/react/menu/group-label/MenuGroupLabel.mjs
init_react();
var MenuGroupLabel = /* @__PURE__ */ forwardRef(function MenuGroupLabel2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    id: idProp,
    ...elementProps
  } = componentProps;
  const id = useBaseUiId(idProp);
  const setLabelId = useMenuGroupRootContext();
  useIsoLayoutEffect(() => {
    setLabelId(id);
    return () => {
      setLabelId((currentId) => currentId === id ? void 0 : currentId);
    };
  }, [setLabelId, id]);
  return useRenderElement("div", componentProps, {
    ref: forwardedRef,
    props: {
      id,
      "aria-hidden": true,
      ...elementProps
    }
  });
});
if (false) MenuGroupLabel.displayName = "MenuGroupLabel";

// node_modules/@base-ui/react/menu/item/MenuItem.mjs
init_react();
var MenuItemPlain = /* @__PURE__ */ forwardRef(function MenuItemPlain2(componentProps, forwardedRef) {
  const {
    render,
    className,
    id: idProp,
    label,
    nativeButton = false,
    disabled: disabledProp = false,
    closeOnClick = true,
    style,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useMenuRootContext();
  const listItem = useCompositeListItem({
    guess: true,
    label
  });
  const id = useBaseUiId(idProp);
  const rootDisabled = store.useState("disabled");
  const highlighted = store.useState("isActive", listItem.index);
  const nodeId = store.useState("floatingNodeId");
  const itemProps = store.useState("itemProps");
  const disabled2 = disabledProp || rootDisabled;
  const {
    getItemProps,
    itemRef
  } = useMenuItem({
    closeOnClick,
    disabled: disabled2,
    highlighted,
    id,
    store,
    nativeButton,
    nodeId,
    itemMetadata: REGULAR_ITEM
  });
  const state = {
    disabled: disabled2,
    highlighted
  };
  return useRenderElement("div", componentProps, {
    state,
    props: [itemProps, elementProps, getItemProps],
    ref: [itemRef, forwardedRef, listItem.ref]
  });
});
if (false) MenuItemPlain.displayName = "MenuItemPlain";
var MenuItem = /* @__PURE__ */ forwardRef(function MenuItem2(props, forwardedRef) {
  const filterItem = useMenuFilterItem(props, forwardedRef);
  if (!filterItem.visible) {
    return null;
  }
  return /* @__PURE__ */ jsx(MenuItemPlain, {
    ...props,
    ref: filterItem.ref
  });
});
if (false) MenuItem.displayName = "MenuItem";

// node_modules/@base-ui/react/menu/link-item/MenuLinkItem.mjs
init_react();
var MenuLinkItemPlain = /* @__PURE__ */ forwardRef(function MenuLinkItemPlain2(componentProps, forwardedRef) {
  const {
    render,
    className,
    id: idProp,
    label,
    closeOnClick = false,
    style,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useMenuRootContext();
  const linkRef = useRef(null);
  const listItem = useCompositeListItem({
    guess: true,
    label
  });
  const id = useBaseUiId(idProp);
  const highlighted = store.useState("isActive", listItem.index);
  const nodeId = store.useState("floatingNodeId");
  const itemProps = store.useState("itemProps");
  const typingRef = store.context.typingRef;
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    native: false,
    composite: true
  });
  const commonProps = useMenuItemCommonProps({
    closeOnClick,
    highlighted,
    id,
    nodeId,
    store,
    typingRef,
    itemRef: linkRef,
    itemMetadata: REGULAR_ITEM
  });
  function getItemProps(externalProps) {
    return mergeProps(commonProps, externalProps, getButtonProps);
  }
  const state = {
    highlighted
  };
  return useRenderElement("a", componentProps, {
    state,
    props: [itemProps, elementProps, getItemProps],
    ref: [linkRef, buttonRef, forwardedRef, listItem.ref]
  });
});
if (false) MenuLinkItemPlain.displayName = "MenuLinkItemPlain";
var MenuLinkItem = /* @__PURE__ */ forwardRef(function MenuLinkItem2(props, forwardedRef) {
  const filterItem = useMenuFilterItem(props, forwardedRef);
  if (!filterItem.visible) {
    return null;
  }
  return /* @__PURE__ */ jsx(MenuLinkItemPlain, {
    ...props,
    ref: filterItem.ref
  });
});
if (false) MenuLinkItem.displayName = "MenuLinkItem";

// node_modules/@base-ui/react/menu/popup/MenuPopup.mjs
init_react();

// node_modules/@base-ui/utils/useTimeout.mjs
var EMPTY2 = 0;
var Timeout = class _Timeout {
  static create() {
    return new _Timeout();
  }
  currentId = EMPTY2;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  start(delay, fn) {
    this.clear();
    this.currentId = setTimeout(() => {
      this.currentId = EMPTY2;
      fn();
    }, delay);
  }
  isStarted() {
    return this.currentId !== EMPTY2;
  }
  clear = () => {
    if (this.currentId !== EMPTY2) {
      clearTimeout(this.currentId);
      this.currentId = EMPTY2;
    }
  };
  disposeEffect = () => {
    return this.clear;
  };
};
function useTimeout() {
  const timeout = useRefWithInit(Timeout.create).current;
  useOnMount(timeout.disposeEffect);
  return timeout;
}

// node_modules/@base-ui/react/floating-ui-react/utils/event.mjs
function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}
function isReactEvent(event) {
  return "nativeEvent" in event;
}
function isVirtualClick(event) {
  if (event.pointerType === "" && event.isTrusted) {
    return true;
  }
  if (parts_exports.os.android && event.pointerType) {
    return event.type === "click" && event.buttons === 1;
  }
  return event.detail === 0 && !event.pointerType;
}
function isVirtualPointerEvent(event) {
  if (parts_exports.env.jsdom) {
    return false;
  }
  return !parts_exports.os.android && event.width === 0 && event.height === 0 || // Chrome synthesizes a screen reader press (TalkBack, VoiceOver, NVDA) as a 1x1 mouse
  // `pointerdown` with no pressure. TalkBack can report a pressed button, while desktop
  // mouse presses can report no pressure, so only require no pressed button off Android.
  event.type === "pointerdown" && event.width === 1 && event.height === 1 && event.pressure === 0 && event.detail === 0 && event.pointerType === "mouse" && (parts_exports.os.android || event.buttons === 0) || // iOS VoiceOver returns 0.333• for width/height.
  event.width < 1 && event.height < 1 && event.pressure === 0 && event.detail === 0 && event.pointerType === "touch";
}
function isMouseLikePointerType(pointerType, strict) {
  const values = ["mouse", "pen"];
  if (!strict) {
    values.push("", void 0);
  }
  return values.includes(pointerType);
}
function isClickLikeEvent(event) {
  const type = event.type;
  return type === "click" || type === "mousedown" || type === "keydown" || type === "keyup";
}

// node_modules/@base-ui/utils/shadowDom.mjs
function activeElement(doc) {
  let element = doc.activeElement;
  while (element?.shadowRoot?.activeElement != null) {
    element = element.shadowRoot.activeElement;
  }
  return element;
}
function contains(parent, child) {
  if (!parent || !child) {
    return false;
  }
  const rootNode = child.getRootNode?.();
  if (parent.contains(child)) {
    return true;
  }
  if (rootNode && isShadowRoot(rootNode)) {
    let next = child;
    while (next) {
      if (parent === next) {
        return true;
      }
      next = next.parentNode || next.host;
    }
  }
  return false;
}
function closest(node, selector) {
  let current = node;
  while (current) {
    if (isElement(current) && current.matches(selector)) {
      return current;
    }
    current = current.assignedSlot ?? current.parentNode ?? (isShadowRoot(current) ? current.host : null);
  }
  return null;
}
function getTarget(event) {
  if ("composedPath" in event) {
    return event.composedPath()[0] ?? event.target;
  }
  return event.target;
}

// node_modules/@base-ui/react/floating-ui-react/utils/constants.mjs
var FOCUSABLE_ATTRIBUTE = "data-base-ui-focusable";
var TYPEABLE_SELECTOR = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";
var ARROW_LEFT = "ArrowLeft";
var ARROW_RIGHT = "ArrowRight";
var ARROW_UP = "ArrowUp";
var ARROW_DOWN = "ArrowDown";

// node_modules/@base-ui/react/tooltip/trigger/TooltipTriggerDataAttributes.mjs
var popupOpen2 = CommonTriggerDataAttributes_exports.popupOpen;
var triggerDisabled = "data-trigger-disabled";

// node_modules/@base-ui/react/floating-ui-react/utils/element.mjs
function isTargetInsideEnabledTrigger(target, triggerElements) {
  if (!isElement(target)) {
    return false;
  }
  const targetElement = target;
  if (triggerElements.hasElement(targetElement)) {
    return !targetElement.hasAttribute(triggerDisabled);
  }
  for (const [, trigger] of triggerElements.entries()) {
    if (contains(trigger, targetElement)) {
      return !trigger.hasAttribute(triggerDisabled);
    }
  }
  return false;
}
function isEventTargetWithin(event, node) {
  if (node == null) {
    return false;
  }
  if ("composedPath" in event) {
    return event.composedPath().includes(node);
  }
  const eventAgain = event;
  return eventAgain.target != null && node.contains(eventAgain.target);
}
function isRootElement(element) {
  return element.matches("html,body");
}
function isTypeableElement(element) {
  return isHTMLElement(element) && element.matches(TYPEABLE_SELECTOR);
}
function isInteractiveElement(element) {
  return closest(element, `button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${TYPEABLE_SELECTOR}`) != null;
}
function isTypeableCombobox(element) {
  if (!element) {
    return false;
  }
  return element.getAttribute("role") === "combobox" && isTypeableElement(element);
}
function matchesFocusVisible(element) {
  if (!element || parts_exports.env.jsdom) {
    return true;
  }
  try {
    return element.matches(":focus-visible");
  } catch (_e) {
    return true;
  }
}
function getFloatingFocusElement(floatingElement) {
  if (!floatingElement) {
    return null;
  }
  return floatingElement.hasAttribute(FOCUSABLE_ATTRIBUTE) ? floatingElement : floatingElement.querySelector(`[${FOCUSABLE_ATTRIBUTE}]`) || floatingElement;
}

// node_modules/@base-ui/react/floating-ui-react/hooks/useHoverShared.mjs
function resolveValue(value, pointerType) {
  if (pointerType != null && !isMouseLikePointerType(pointerType)) {
    return 0;
  }
  if (typeof value === "function") {
    return value();
  }
  return value;
}
function getDelay(value, prop, pointerType) {
  const result = resolveValue(value, pointerType);
  if (typeof result === "number") {
    return result;
  }
  return result?.[prop];
}
function getRestMs(value) {
  if (typeof value === "function") {
    return value();
  }
  return value;
}
function isClickLikeOpenEvent(openEventType, interactedInside) {
  return interactedInside || openEventType === "click" || openEventType === "mousedown";
}
function isHoverOpenEvent(openEventType) {
  return openEventType?.includes("mouse") && openEventType !== "mousedown";
}

// node_modules/@base-ui/react/floating-ui-react/components/FloatingFocusManager.mjs
init_react();

// node_modules/@base-ui/utils/addEventListener.mjs
function addEventListener(target, type, listener, options) {
  target.addEventListener(type, listener, options);
  return () => {
    target.removeEventListener(type, listener, options);
  };
}

// node_modules/@base-ui/utils/mergeCleanups.mjs
function mergeCleanups(...cleanups) {
  return () => {
    for (let i = 0; i < cleanups.length; i += 1) {
      const cleanup = cleanups[i];
      if (cleanup) {
        cleanup();
      }
    }
  };
}

// node_modules/@base-ui/utils/useValueAsRef.mjs
function useValueAsRef(value) {
  const latest = useRefWithInit(createLatestRef, value).current;
  latest.next = value;
  useIsoLayoutEffect(latest.effect);
  return latest;
}
function createLatestRef(value) {
  const latest = {
    current: value,
    next: value,
    effect: () => {
      latest.current = latest.next;
    }
  };
  return latest;
}

// node_modules/@base-ui/react/utils/FocusGuard.mjs
init_react();

// node_modules/@base-ui/utils/visuallyHidden.mjs
var visuallyHiddenBase = {
  clipPath: "inset(50%)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  border: 0,
  padding: 0,
  width: 1,
  height: 1,
  margin: -1
};
var visuallyHidden = {
  ...visuallyHiddenBase,
  position: "fixed",
  margin: 0,
  top: 0,
  left: 0
};
var visuallyHiddenInput = {
  ...visuallyHiddenBase,
  position: "absolute"
};

// node_modules/@base-ui/react/utils/FocusGuard.mjs
var FocusGuard = /* @__PURE__ */ forwardRef(function FocusGuard2(props, ref) {
  const [role, setRole] = useState();
  useIsoLayoutEffect(() => {
    if (parts_exports.screenReader.voiceOver && parts_exports.engine.webkit) {
      setRole("button");
    }
  }, []);
  const restProps = {
    tabIndex: 0,
    // Role is only for VoiceOver
    role
  };
  return /* @__PURE__ */ jsx("span", {
    ...props,
    ref,
    style: visuallyHidden,
    "aria-hidden": role ? void 0 : true,
    ...restProps,
    "data-base-ui-focus-guard": ""
  });
});
if (false) FocusGuard.displayName = "FocusGuard";

// node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
var min = Math.min;
var max = Math.max;
var round = Math.round;
var floor = Math.floor;
var createCoords = (v) => ({
  x: v,
  y: v
});
var oppositeSideMap = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function clamp(start, value, end) {
  return max(start, min(value, end));
}
function evaluate(value, param) {
  return typeof value === "function" ? value(param) : value;
}
function getSide(placement) {
  return placement.split("-")[0];
}
function getAlignment(placement) {
  return placement.split("-")[1];
}
function getOppositeAxis(axis) {
  return axis === "x" ? "y" : "x";
}
function getAxisLength(axis) {
  return axis === "y" ? "height" : "width";
}
function getSideAxis(placement) {
  const firstChar = placement[0];
  return firstChar === "t" || firstChar === "b" ? "y" : "x";
}
function getAlignmentAxis(placement) {
  return getOppositeAxis(getSideAxis(placement));
}
function getAlignmentSides(placement, rects, rtl) {
  if (rtl === void 0) {
    rtl = false;
  }
  const alignment = getAlignment(placement);
  const alignmentAxis = getAlignmentAxis(placement);
  const length = getAxisLength(alignmentAxis);
  let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
  if (rects.reference[length] > rects.floating[length]) {
    mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
  }
  return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
}
function getExpandedPlacements(placement) {
  const oppositePlacement = getOppositePlacement(placement);
  return [getOppositeAlignmentPlacement(placement), oppositePlacement, getOppositeAlignmentPlacement(oppositePlacement)];
}
function getOppositeAlignmentPlacement(placement) {
  return placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start");
}
var lrPlacement = ["left", "right"];
var rlPlacement = ["right", "left"];
var tbPlacement = ["top", "bottom"];
var btPlacement = ["bottom", "top"];
function getSideList(side, isStart, rtl) {
  switch (side) {
    case "top":
    case "bottom":
      if (rtl) return isStart ? rlPlacement : lrPlacement;
      return isStart ? lrPlacement : rlPlacement;
    case "left":
    case "right":
      return isStart ? tbPlacement : btPlacement;
    default:
      return [];
  }
}
function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
  const alignment = getAlignment(placement);
  let list = getSideList(getSide(placement), direction === "start", rtl);
  if (alignment) {
    list = list.map((side) => side + "-" + alignment);
    if (flipAlignment) {
      list = list.concat(list.map(getOppositeAlignmentPlacement));
    }
  }
  return list;
}
function getOppositePlacement(placement) {
  const side = getSide(placement);
  return oppositeSideMap[side] + placement.slice(side.length);
}
function expandPaddingObject(padding) {
  var _padding$top, _padding$right, _padding$bottom, _padding$left;
  return {
    top: (_padding$top = padding.top) != null ? _padding$top : 0,
    right: (_padding$right = padding.right) != null ? _padding$right : 0,
    bottom: (_padding$bottom = padding.bottom) != null ? _padding$bottom : 0,
    left: (_padding$left = padding.left) != null ? _padding$left : 0
  };
}
function getPaddingObject(padding) {
  return typeof padding !== "number" ? expandPaddingObject(padding) : {
    top: padding,
    right: padding,
    bottom: padding,
    left: padding
  };
}
function rectToClientRect(rect) {
  const {
    x,
    y,
    width,
    height
  } = rect;
  return {
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    x,
    y
  };
}

// node_modules/@base-ui/react/floating-ui-react/utils/composite.mjs
function isIndexOutOfListBounds(list, index2) {
  return index2 < 0 || index2 >= list.length;
}
function getMinListIndex(listRef, disabledIndices) {
  return findNonDisabledListIndex(listRef.current, {
    disabledIndices
  });
}
function getMaxListIndex(listRef, disabledIndices) {
  return findNonDisabledListIndex(listRef.current, {
    decrement: true,
    startingIndex: listRef.current.length,
    disabledIndices
  });
}
function getNextListIndex(list, currentIndex, options) {
  const {
    decrement,
    loopFocus,
    allowEscape,
    disabledIndices,
    minIndex,
    maxIndex
  } = options;
  const step = () => findNonDisabledListIndex(list, {
    startingIndex: currentIndex,
    decrement,
    disabledIndices
  });
  let index2;
  let wrapped = false;
  if (!loopFocus) {
    index2 = decrement ? Math.max(minIndex, step()) : Math.min(maxIndex, step());
  } else if (decrement ? currentIndex <= minIndex : currentIndex >= maxIndex) {
    const outside = decrement ? -1 : list.length;
    if (allowEscape && currentIndex !== outside) {
      index2 = -1;
    } else {
      index2 = decrement ? maxIndex : minIndex;
      wrapped = true;
    }
  } else {
    index2 = step();
  }
  return {
    index: isIndexOutOfListBounds(list, index2) ? -1 : index2,
    wrapped
  };
}
function findNonDisabledListIndex(list, {
  startingIndex = -1,
  decrement = false,
  disabledIndices,
  amount = 1
} = {}) {
  let index2 = startingIndex;
  do {
    index2 += decrement ? -amount : amount;
  } while (index2 >= 0 && index2 <= list.length - 1 && isListIndexDisabled(list, index2, disabledIndices));
  return index2;
}
function isListIndexDisabled(list, index2, disabledIndices) {
  const isExplicitlyDisabled = typeof disabledIndices === "function" ? disabledIndices(index2) : disabledIndices?.includes(index2) ?? false;
  if (isExplicitlyDisabled) {
    return true;
  }
  const element = list[index2];
  if (!element) {
    return false;
  }
  if (!isElementVisible(element)) {
    return true;
  }
  if (element.matches(":disabled")) {
    return true;
  }
  return !disabledIndices && (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true");
}
function isHiddenByStyles(styles) {
  return styles.visibility === "hidden" || styles.visibility === "collapse";
}
function isElementVisible(element, styles = element ? getComputedStyle2(element) : null) {
  if (!element || !element.isConnected || !styles || isHiddenByStyles(styles)) {
    return false;
  }
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility();
  }
  return styles.display !== "none" && styles.display !== "contents";
}

// node_modules/@base-ui/react/floating-ui-react/utils/tabbable.mjs
var CANDIDATE_SELECTOR = 'a[href],button,input,select,textarea,summary,details,iframe,object,embed,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';
function getParentElement(element) {
  const assignedSlot = element.assignedSlot;
  if (assignedSlot) {
    return assignedSlot;
  }
  if (element.parentElement) {
    return element.parentElement;
  }
  const rootNode = element.getRootNode();
  return isShadowRoot(rootNode) ? rootNode.host : null;
}
function getDetailsSummary(details) {
  for (const child of Array.from(details.children)) {
    if (getNodeName(child) === "summary") {
      return child;
    }
  }
  return null;
}
function isWithinOpenDetailsSummary(element, details) {
  const summary = getDetailsSummary(details);
  return !!summary && (element === summary || contains(summary, element));
}
function isFocusableCandidate(element) {
  const nodeName = element ? getNodeName(element) : "";
  return element != null && element.matches(CANDIDATE_SELECTOR) && (nodeName !== "summary" || element.parentElement != null && getNodeName(element.parentElement) === "details" && getDetailsSummary(element.parentElement) === element) && (nodeName !== "details" || getDetailsSummary(element) == null) && (nodeName !== "input" || element.type !== "hidden");
}
function isFocusableElement(element) {
  if (!isFocusableCandidate(element) || !element.isConnected || element.matches(":disabled")) {
    return false;
  }
  for (let current = element; current; current = getParentElement(current)) {
    const isAncestor = current !== element;
    const isSlot = getNodeName(current) === "slot";
    if (current.hasAttribute("inert")) {
      return false;
    }
    if (isAncestor && getNodeName(current) === "details" && !current.open && !isWithinOpenDetailsSummary(element, current) || current.hasAttribute("hidden") || !isSlot && !isVisibleInTabbableTree(current, isAncestor)) {
      return false;
    }
  }
  return true;
}
function isVisibleInTabbableTree(element, isAncestor) {
  const styles = getComputedStyle2(element);
  if (!isAncestor) {
    return isElementVisible(element, styles);
  }
  return styles.display !== "none";
}
function getTabIndex(element) {
  const tabIndex = element.tabIndex;
  if (tabIndex < 0) {
    const nodeName = getNodeName(element);
    if (nodeName === "details" || nodeName === "audio" || nodeName === "video" || isHTMLElement(element) && element.isContentEditable) {
      return 0;
    }
  }
  return tabIndex;
}
function getNamedRadioInput(element) {
  if (getNodeName(element) !== "input") {
    return null;
  }
  const input = element;
  return input.type === "radio" && input.name !== "" ? input : null;
}
function isTabbableRadio(element, candidates) {
  const input = getNamedRadioInput(element);
  if (!input) {
    return true;
  }
  const checkedRadio = candidates.find((candidate) => {
    const radio = getNamedRadioInput(candidate);
    return radio?.name === input.name && radio.form === input.form && radio.checked;
  });
  if (checkedRadio) {
    return checkedRadio === input;
  }
  return candidates.find((candidate) => {
    const radio = getNamedRadioInput(candidate);
    return radio?.name === input.name && radio.form === input.form;
  }) === input;
}
function getComposedChildren(container) {
  if (isHTMLElement(container) && getNodeName(container) === "slot") {
    const assignedElements = container.assignedElements({
      flatten: true
    });
    if (assignedElements.length > 0) {
      return assignedElements;
    }
  }
  if (isHTMLElement(container) && container.shadowRoot) {
    return Array.from(container.shadowRoot.children);
  }
  return Array.from(container.children);
}
function appendCandidates(container, list) {
  getComposedChildren(container).forEach((child) => {
    if (isFocusableCandidate(child)) {
      list.push(child);
    }
    appendCandidates(child, list);
  });
}
function appendMatchingElements(container, selector, list) {
  getComposedChildren(container).forEach((child) => {
    if (isHTMLElement(child) && child.matches(selector)) {
      list.push(child);
    }
    appendMatchingElements(child, selector, list);
  });
}
function isTabbable(element) {
  return isFocusableElement(element) && getTabIndex(element) >= 0;
}
function focusable(container) {
  const candidates = [];
  appendCandidates(container, candidates);
  return candidates.filter(isFocusableElement);
}
function tabbable(container) {
  const candidates = focusable(container);
  return candidates.filter((element) => getTabIndex(element) >= 0 && isTabbableRadio(element, candidates));
}
function getTabbableIn(container, dir) {
  const list = tabbable(container);
  const len = list.length;
  if (len === 0) {
    return void 0;
  }
  const active = activeElement(ownerDocument(container));
  const index2 = list.indexOf(active);
  const nextIndex = index2 === -1 ? dir === 1 ? 0 : len - 1 : index2 + dir;
  return list[nextIndex];
}
function getNextTabbable(referenceElement) {
  return getTabbableIn(ownerDocument(referenceElement).body, 1) || referenceElement;
}
function getPreviousTabbable(referenceElement) {
  return getTabbableIn(ownerDocument(referenceElement).body, -1) || referenceElement;
}
function getTabbableNearElement(referenceElement, direction, exclude) {
  if (!referenceElement) {
    return null;
  }
  const list = [];
  appendCandidates(ownerDocument(referenceElement).body, list);
  const index2 = list.indexOf(referenceElement);
  if (index2 === -1) {
    return null;
  }
  const candidates = list.filter(isFocusableElement);
  for (let offset4 = 1; offset4 < list.length; offset4 += 1) {
    const element = list[(index2 + direction * offset4 + list.length) % list.length];
    if (!contains(exclude, element) && isTabbable(element) && isTabbableRadio(element, candidates)) {
      return element;
    }
  }
  return list[index2];
}
function isOutsideEvent(event, container) {
  const containerElement = container || event.currentTarget;
  const relatedTarget = event.relatedTarget;
  return !relatedTarget || !contains(containerElement, relatedTarget);
}
function disableFocusInside(container) {
  const tabbableElements = tabbable(container);
  tabbableElements.forEach((element) => {
    element.dataset.tabindex = element.getAttribute("tabindex") || "";
    element.setAttribute("tabindex", "-1");
  });
}
function enableFocusInside(container) {
  const elements = [];
  appendMatchingElements(container, "[data-tabindex]", elements);
  elements.forEach((element) => {
    const tabindex = element.dataset.tabindex;
    delete element.dataset.tabindex;
    if (tabindex) {
      element.setAttribute("tabindex", tabindex);
    } else {
      element.removeAttribute("tabindex");
    }
  });
}

// node_modules/@base-ui/react/floating-ui-react/utils/nodes.mjs
function getNodeChildren(nodes, id, onlyOpenChildren = true) {
  const directChildren = nodes.filter((node) => node.parentId === id);
  return directChildren.flatMap((child) => [...!onlyOpenChildren || child.context?.open ? [child] : [], ...getNodeChildren(nodes, child.id, onlyOpenChildren)]);
}
function getNodeAncestors(nodes, id) {
  let allAncestors = [];
  let currentParentId = nodes.find((node) => node.id === id)?.parentId;
  while (currentParentId) {
    const currentNode = nodes.find((node) => node.id === currentParentId);
    currentParentId = currentNode?.parentId;
    if (currentNode) {
      allAncestors = allAncestors.concat(currentNode);
    }
  }
  return allAncestors;
}

// node_modules/@base-ui/react/floating-ui-react/utils/createAttribute.mjs
function createAttribute(name) {
  return `data-base-ui-${name}`;
}

// node_modules/@base-ui/react/floating-ui-react/utils/enqueueFocus.mjs
var rafId = 0;
function enqueueFocus(el, options = {}) {
  const {
    preventScroll = false,
    sync = false,
    shouldFocus
  } = options;
  cancelAnimationFrame(rafId);
  function exec() {
    if (shouldFocus && !shouldFocus()) {
      return;
    }
    el?.focus({
      preventScroll
    });
  }
  if (sync) {
    exec();
    return NOOP;
  }
  const currentRafId = requestAnimationFrame(exec);
  rafId = currentRafId;
  return () => {
    if (rafId === currentRafId) {
      cancelAnimationFrame(currentRafId);
      rafId = 0;
    }
  };
}

// node_modules/@base-ui/react/floating-ui-react/utils/markOthers.mjs
var markerName = "data-base-ui-inert";
var ariaHiddenCounterMap = /* @__PURE__ */ new WeakMap();
var uncontrolledElementsSet = /* @__PURE__ */ new WeakSet();
var markerCounterMap = /* @__PURE__ */ new WeakMap();
var lockCount = 0;
function unwrapHost(node) {
  if (!node) {
    return null;
  }
  return isShadowRoot(node) ? node.host : unwrapHost(node.parentNode);
}
var correctElements = (parent, targets) => targets.map((target) => {
  if (parent.contains(target)) {
    return target;
  }
  const correctedTarget = unwrapHost(target);
  if (parent.contains(correctedTarget)) {
    return correctedTarget;
  }
  return null;
}).filter((x) => x != null);
var buildKeepSet = (targets) => {
  const keep = /* @__PURE__ */ new Set();
  targets.forEach((target) => {
    let node = target;
    while (node && !keep.has(node)) {
      keep.add(node);
      node = node.parentNode;
    }
  });
  return keep;
};
var collectOutsideElements = (root, keepElements, stopElements) => {
  const outside = [];
  const walk = (parent) => {
    if (!parent || stopElements.has(parent)) {
      return;
    }
    Array.from(parent.children).forEach((node) => {
      if (getNodeName(node) === "script") {
        return;
      }
      if (keepElements.has(node)) {
        walk(node);
      } else {
        outside.push(node);
      }
    });
  };
  walk(root);
  return outside;
};
function applyAttributeToOthers(uncorrectedAvoidElements, body, ariaHidden, {
  mark = true
}) {
  const avoidElements = correctElements(body, uncorrectedAvoidElements);
  const markerTargets = mark ? collectOutsideElements(body, buildKeepSet(avoidElements), new Set(avoidElements)) : [];
  const hiddenElements = [];
  const markedElements = [];
  if (ariaHidden) {
    const ariaLiveElements = correctElements(body, Array.from(body.querySelectorAll("[aria-live]")));
    const controlElements = avoidElements.concat(ariaLiveElements);
    const controlTargets = collectOutsideElements(body, buildKeepSet(controlElements), new Set(controlElements));
    controlTargets.forEach((node) => {
      const attr2 = node.getAttribute("aria-hidden");
      const alreadyHidden = attr2 !== null && attr2 !== "false";
      const counterValue = (ariaHiddenCounterMap.get(node) || 0) + 1;
      ariaHiddenCounterMap.set(node, counterValue);
      hiddenElements.push(node);
      if (counterValue === 1 && alreadyHidden) {
        uncontrolledElementsSet.add(node);
      }
      if (!alreadyHidden) {
        node.setAttribute("aria-hidden", "true");
      }
    });
  }
  if (mark) {
    markerTargets.forEach((node) => {
      const markerValue = (markerCounterMap.get(node) || 0) + 1;
      markerCounterMap.set(node, markerValue);
      markedElements.push(node);
      if (markerValue === 1) {
        node.setAttribute(markerName, "");
      }
    });
  }
  lockCount += 1;
  return () => {
    hiddenElements.forEach((element) => {
      const counterValue = (ariaHiddenCounterMap.get(element) || 0) - 1;
      ariaHiddenCounterMap.set(element, counterValue);
      if (!counterValue) {
        if (!uncontrolledElementsSet.has(element)) {
          element.removeAttribute("aria-hidden");
        }
        uncontrolledElementsSet.delete(element);
      }
    });
    if (mark) {
      markedElements.forEach((element) => {
        const markerValue = (markerCounterMap.get(element) || 0) - 1;
        markerCounterMap.set(element, markerValue);
        if (!markerValue) {
          element.removeAttribute(markerName);
        }
      });
    }
    lockCount -= 1;
    if (!lockCount) {
      ariaHiddenCounterMap = /* @__PURE__ */ new WeakMap();
      uncontrolledElementsSet = /* @__PURE__ */ new WeakSet();
      markerCounterMap = /* @__PURE__ */ new WeakMap();
    }
  };
}
function markOthers(avoidElements, options = {}) {
  const {
    ariaHidden = false,
    mark = true
  } = options;
  const body = ownerDocument(avoidElements[0]).body;
  return applyAttributeToOthers(avoidElements, body, ariaHidden, {
    mark
  });
}

// node_modules/@base-ui/react/floating-ui-react/components/FloatingPortal.mjs
init_react();

// node_modules/@base-ui/react/internals/constants.mjs
var TYPEAHEAD_RESET_MS = 500;
var PATIENT_CLICK_THRESHOLD = 500;
var DISABLED_TRANSITIONS_STYLE = {
  style: {
    transition: "none"
  }
};
var CLICK_TRIGGER_IDENTIFIER = "data-base-ui-click-trigger";
var BASE_UI_SWIPE_IGNORE_ATTRIBUTE = "data-base-ui-swipe-ignore";
var LEGACY_SWIPE_IGNORE_ATTRIBUTE = "data-swipe-ignore";
var BASE_UI_SWIPE_IGNORE_SELECTOR = `[${BASE_UI_SWIPE_IGNORE_ATTRIBUTE}]`;
var LEGACY_SWIPE_IGNORE_SELECTOR = `[${LEGACY_SWIPE_IGNORE_ATTRIBUTE}]`;
var DROPDOWN_COLLISION_AVOIDANCE = {
  fallbackAxisSide: "none"
};
var POPUP_COLLISION_AVOIDANCE = {
  fallbackAxisSide: "end"
};
var ownerVisuallyHidden = {
  clipPath: "inset(50%)",
  position: "fixed",
  top: 0,
  left: 0
};

// node_modules/@base-ui/react/floating-ui-react/components/FloatingPortal.mjs
var PortalContext = /* @__PURE__ */ createContext(null);
if (false) PortalContext.displayName = "PortalContext";
var usePortalContext = () => useContext(PortalContext);
var attr = createAttribute("portal");
function useFloatingPortalNode(props = {}) {
  const {
    ref,
    container: containerProp,
    componentProps = EMPTY_OBJECT,
    elementProps
  } = props;
  const uniqueId = useId2();
  const portalContext = usePortalContext();
  const parentPortalNode = portalContext?.portalNode;
  const [containerElement, setContainerElement] = useState(null);
  const [portalNode, setPortalNode] = useState(null);
  const setPortalNodeRef = useStableCallback((node) => {
    if (node !== null) {
      setPortalNode(node);
    }
  });
  const containerRef = useRef(null);
  useIsoLayoutEffect(() => {
    if (containerProp === null) {
      if (containerRef.current) {
        containerRef.current = null;
        setPortalNode(null);
        setContainerElement(null);
      }
      return;
    }
    const resolvedContainer = (containerProp && (isNode(containerProp) ? containerProp : containerProp.current)) ?? parentPortalNode ?? document.body;
    if (resolvedContainer == null) {
      if (containerRef.current) {
        containerRef.current = null;
        setPortalNode(null);
        setContainerElement(null);
      }
      return;
    }
    if (containerRef.current !== resolvedContainer) {
      containerRef.current = resolvedContainer;
      setPortalNode(null);
      setContainerElement(resolvedContainer);
    }
  }, [containerProp, parentPortalNode]);
  const portalElement = useRenderElement("div", componentProps, {
    ref: [ref, setPortalNodeRef],
    props: [{
      id: uniqueId,
      [attr]: ""
    }, elementProps]
  });
  const portalSubtree = containerElement && portalElement ? /* @__PURE__ */ createPortal(portalElement, containerElement) : null;
  return {
    node: portalNode,
    // `id` and `render` props can override or remove the generated ID. Use the exact
    // rendered value so `aria-owns` never points at an ID absent from the DOM.
    nodeId: /* @__PURE__ */ isValidElement(portalElement) ? portalElement.props.id : void 0,
    subtree: portalSubtree
  };
}
var FloatingPortal = /* @__PURE__ */ forwardRef(function FloatingPortal2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    children,
    container,
    portalOwnerRole,
    ...elementProps
  } = componentProps;
  const {
    node: portalNode,
    nodeId: portalNodeId,
    subtree: portalSubtree
  } = useFloatingPortalNode({
    container,
    ref: forwardedRef,
    componentProps,
    elementProps
  });
  const beforeOutsideRef = useRef(null);
  const afterOutsideRef = useRef(null);
  const beforeInsideRef = useRef(null);
  const afterInsideRef = useRef(null);
  const [focusManagerState, setFocusManagerState] = useState(null);
  const focusInsideDisabledRef = useRef(false);
  const modal = focusManagerState?.modal;
  const open2 = focusManagerState?.open;
  const shouldRenderGuards = !!focusManagerState && !focusManagerState.modal && focusManagerState.open && !!portalNode;
  useEffect(() => {
    if (!portalNode || modal) {
      return void 0;
    }
    function onFocus(event) {
      if (portalNode && event.relatedTarget && isOutsideEvent(event)) {
        if (event.type === "focusin") {
          if (focusInsideDisabledRef.current) {
            enableFocusInside(portalNode);
            focusInsideDisabledRef.current = false;
          }
        } else {
          disableFocusInside(portalNode);
          focusInsideDisabledRef.current = true;
        }
      }
    }
    return mergeCleanups(addEventListener(portalNode, "focusin", onFocus, true), addEventListener(portalNode, "focusout", onFocus, true));
  }, [portalNode, modal]);
  useIsoLayoutEffect(() => {
    if (!portalNode || open2 !== true || !focusInsideDisabledRef.current) {
      return;
    }
    enableFocusInside(portalNode);
    focusInsideDisabledRef.current = false;
  }, [open2, portalNode]);
  const portalContextValue = useMemo(() => ({
    beforeOutsideRef,
    afterOutsideRef,
    beforeInsideRef,
    afterInsideRef,
    portalNode,
    setFocusManagerState
  }), [portalNode]);
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [portalSubtree, /* @__PURE__ */ jsxs(PortalContext.Provider, {
      value: portalContextValue,
      children: [shouldRenderGuards && portalNode && /* @__PURE__ */ jsx(FocusGuard, {
        "data-type": "outside",
        ref: beforeOutsideRef,
        onFocus: (event) => {
          if (isOutsideEvent(event, portalNode)) {
            beforeInsideRef.current?.focus();
          } else {
            const domReference = focusManagerState ? focusManagerState.domReference : null;
            const prevTabbable = getPreviousTabbable(domReference);
            prevTabbable?.focus();
          }
        }
      }), shouldRenderGuards && portalNode && /* @__PURE__ */ jsx("span", {
        role: portalOwnerRole,
        "aria-owns": portalNodeId,
        style: ownerVisuallyHidden
      }), portalNode && /* @__PURE__ */ createPortal(children, portalNode), shouldRenderGuards && portalNode && /* @__PURE__ */ jsx(FocusGuard, {
        "data-type": "outside",
        ref: afterOutsideRef,
        onFocus: (event) => {
          if (isOutsideEvent(event, portalNode)) {
            afterInsideRef.current?.focus();
          } else {
            const domReference = focusManagerState ? focusManagerState.domReference : null;
            const nextTabbable = getNextTabbable(domReference);
            nextTabbable?.focus();
            if (focusManagerState?.closeOnFocusOut) {
              focusManagerState?.onOpenChange(false, createChangeEventDetails(reason_parts_exports.focusOut, event.nativeEvent));
            }
          }
        }
      })]
    })]
  });
});
if (false) FloatingPortal.displayName = "FloatingPortal";

// node_modules/@base-ui/react/floating-ui-react/components/FloatingTree.mjs
init_react();

// node_modules/@base-ui/react/floating-ui-react/utils/createEventEmitter.mjs
function createEventEmitter() {
  const map = /* @__PURE__ */ new Map();
  return {
    emit(event, data) {
      map.get(event)?.forEach((listener) => listener(data));
    },
    on(event, listener) {
      if (!map.has(event)) {
        map.set(event, /* @__PURE__ */ new Set());
      }
      map.get(event).add(listener);
    },
    off(event, listener) {
      map.get(event)?.delete(listener);
    }
  };
}

// node_modules/@base-ui/react/floating-ui-react/components/FloatingTreeStore.mjs
var FloatingTreeStore = class {
  nodesRef = {
    current: []
  };
  events = createEventEmitter();
  addNode(node) {
    this.nodesRef.current.push(node);
  }
  removeNode(node) {
    const index2 = this.nodesRef.current.findIndex((n) => n === node);
    if (index2 !== -1) {
      this.nodesRef.current.splice(index2, 1);
    }
  }
};

// node_modules/@base-ui/react/floating-ui-react/components/FloatingTree.mjs
var FloatingNodeContext = /* @__PURE__ */ createContext(null);
if (false) FloatingNodeContext.displayName = "FloatingNodeContext";
var FloatingTreeContext = /* @__PURE__ */ createContext(null);
if (false) FloatingTreeContext.displayName = "FloatingTreeContext";
var useFloatingParentNodeId = () => useContext(FloatingNodeContext)?.id || null;
var useFloatingTree = (externalTree) => {
  const contextTree = useContext(FloatingTreeContext);
  return externalTree ?? contextTree;
};
function useFloatingNodeId(externalTree) {
  const id = useId2();
  const tree = useFloatingTree(externalTree);
  const parentId = useFloatingParentNodeId();
  useIsoLayoutEffect(() => {
    if (!id) {
      return void 0;
    }
    const node = {
      id,
      parentId
    };
    tree?.addNode(node);
    return () => {
      tree?.removeNode(node);
    };
  }, [tree, id, parentId]);
  return id;
}
function FloatingNode(props) {
  const {
    children,
    id
  } = props;
  const parentId = useFloatingParentNodeId();
  return /* @__PURE__ */ jsx(FloatingNodeContext.Provider, {
    value: useMemo(() => ({
      id,
      parentId
    }), [id, parentId]),
    children
  });
}
function FloatingTree(props) {
  const {
    children,
    externalTree
  } = props;
  const tree = useRefWithInit(() => externalTree ?? new FloatingTreeStore()).current;
  return /* @__PURE__ */ jsx(FloatingTreeContext.Provider, {
    value: tree,
    children
  });
}

// node_modules/@base-ui/react/floating-ui-react/components/FloatingFocusManager.mjs
function getEventType(event, lastInteractionType) {
  const win = getWindow(getTarget(event));
  if (event instanceof win.KeyboardEvent) {
    return "keyboard";
  }
  if (event instanceof win.FocusEvent) {
    return lastInteractionType || "keyboard";
  }
  if ("pointerType" in event) {
    return event.pointerType || (isVirtualClick(event) ? "keyboard" : lastInteractionType || "mouse");
  }
  if ("touches" in event) {
    return "touch";
  }
  if (event instanceof win.MouseEvent) {
    return lastInteractionType || (event.detail === 0 ? "keyboard" : "mouse");
  }
  return "";
}
var LIST_LIMIT = 20;
var previouslyFocusedElements = [];
function clearDisconnectedPreviouslyFocusedElements() {
  previouslyFocusedElements = previouslyFocusedElements.filter((entry) => {
    return entry.deref()?.isConnected;
  });
}
function addPreviouslyFocusedElement(element) {
  clearDisconnectedPreviouslyFocusedElements();
  if (element && getNodeName(element) !== "body") {
    previouslyFocusedElements.push(new WeakRef(element));
    if (previouslyFocusedElements.length > LIST_LIMIT) {
      previouslyFocusedElements = previouslyFocusedElements.slice(-LIST_LIMIT);
    }
  }
}
function getPreviouslyFocusedElement() {
  clearDisconnectedPreviouslyFocusedElements();
  return previouslyFocusedElements[previouslyFocusedElements.length - 1]?.deref();
}
function getFirstTabbableElement(container) {
  if (!container) {
    return null;
  }
  if (isTabbable(container)) {
    return container;
  }
  return tabbable(container)[0] || container;
}
function handleTabIndex(floatingFocusElement) {
  if (floatingFocusElement.hasAttribute("tabindex") && !floatingFocusElement.hasAttribute("data-tabindex")) {
    return;
  }
  if (!floatingFocusElement.getAttribute("role")?.includes("dialog")) {
    return;
  }
  const focusableElements = focusable(floatingFocusElement);
  const tabbableContent = focusableElements.filter((element) => {
    const dataTabIndex = element.getAttribute("data-tabindex") || "";
    return isTabbable(element) || element.hasAttribute("data-tabindex") && !dataTabIndex.startsWith("-");
  });
  const tabIndex = floatingFocusElement.getAttribute("tabindex");
  if (tabbableContent.length === 0) {
    if (tabIndex !== "0") {
      floatingFocusElement.setAttribute("tabindex", "0");
      floatingFocusElement.setAttribute("data-tabindex", "0");
    }
  } else if (tabIndex !== "-1" || floatingFocusElement.hasAttribute("data-tabindex") && floatingFocusElement.getAttribute("data-tabindex") !== "-1") {
    floatingFocusElement.setAttribute("tabindex", "-1");
    floatingFocusElement.setAttribute("data-tabindex", "-1");
  }
}
function FloatingFocusManager(props) {
  const {
    context: store,
    children,
    disabled: disabled2 = false,
    initialFocus = true,
    returnFocus = true,
    explicitReturnFocus,
    restoreFocus = false,
    modal = true,
    closeOnFocusOut = true,
    openInteractionType = "",
    nextFocusableElement,
    previousFocusableElement,
    beforeContentFocusGuardRef,
    externalTree,
    getInsideElements
  } = props;
  const open2 = store.useState("open");
  const domReference = store.useState("domReferenceElement");
  const floating = store.useState("floatingElement");
  const {
    events,
    dataRef
  } = store.context;
  const getNodeId = useStableCallback(() => dataRef.current.floatingContext?.nodeId);
  const ignoreInitialFocus = initialFocus === false;
  const isUntrappedTypeableCombobox = isTypeableCombobox(domReference) && ignoreInitialFocus;
  const initialFocusRef = useValueAsRef(initialFocus);
  const returnFocusRef = useValueAsRef(returnFocus);
  const explicitReturnFocusRef = useValueAsRef(explicitReturnFocus);
  const openInteractionTypeRef = useValueAsRef(openInteractionType);
  const openRef = useValueAsRef(open2);
  const tree = useFloatingTree(externalTree);
  const portalContext = usePortalContext();
  const preventReturnFocusRef = useRef(false);
  const isPointerDownRef = useRef(false);
  const pointerDownOutsideRef = useRef(false);
  const lastFocusedTabbableRef = useRef(null);
  const closeTypeRef = useRef("");
  const lastInteractionTypeRef = useRef("");
  const beforeGuardRef = useRef(null);
  const afterGuardRef = useRef(null);
  const mergedBeforeGuardRef = useMergedRefs(beforeGuardRef, beforeContentFocusGuardRef, portalContext?.beforeInsideRef);
  const mergedAfterGuardRef = useMergedRefs(afterGuardRef, portalContext?.afterInsideRef);
  const blurTimeout = useTimeout();
  const pointerDownTimeout = useTimeout();
  const restoreFocusFrame = useAnimationFrame();
  const isInsidePortal = portalContext != null;
  const floatingFocusElement = getFloatingFocusElement(floating);
  const getTabbableContent = useStableCallback((container = floatingFocusElement) => {
    return container ? tabbable(container) : [];
  });
  const getResolvedInsideElements = useStableCallback(() => getInsideElements?.().filter((element) => element != null) ?? []);
  useEffect(() => {
    if (disabled2 || !modal) {
      return void 0;
    }
    function onKeyDown(event) {
      if (event.key === "Tab") {
        if (contains(floatingFocusElement, activeElement(ownerDocument(floatingFocusElement))) && getTabbableContent().length === 0 && !isUntrappedTypeableCombobox) {
          stopEvent(event);
        }
      }
    }
    const doc = ownerDocument(floatingFocusElement);
    return addEventListener(doc, "keydown", onKeyDown);
  }, [disabled2, floatingFocusElement, modal, isUntrappedTypeableCombobox, getTabbableContent]);
  useEffect(() => {
    if (disabled2 || !open2) {
      return void 0;
    }
    const doc = ownerDocument(floatingFocusElement);
    function clearPointerDownOutside() {
      pointerDownOutsideRef.current = false;
    }
    function onPointerDown(event) {
      const target = getTarget(event);
      const insideElements = getResolvedInsideElements();
      const pointerTargetInside = contains(floating, target) || contains(domReference, target) || contains(portalContext?.portalNode, target) || insideElements.some((element) => element === target || contains(element, target));
      pointerDownOutsideRef.current = !pointerTargetInside;
      lastInteractionTypeRef.current = event.pointerType || "keyboard";
      if (closest(target, `[${CLICK_TRIGGER_IDENTIFIER}]`)) {
        isPointerDownRef.current = true;
        pointerDownTimeout.start(0, () => {
          isPointerDownRef.current = false;
        });
      }
    }
    function onKeyDown() {
      lastInteractionTypeRef.current = "keyboard";
    }
    return mergeCleanups(
      addEventListener(doc, "pointerdown", onPointerDown, true),
      addEventListener(doc, "pointerup", clearPointerDownOutside, true),
      addEventListener(doc, "pointercancel", clearPointerDownOutside, true),
      addEventListener(doc, "keydown", onKeyDown, true),
      // Avoid a stale `true` leaking into the next open (e.g. keep-mounted popups)
      // if the popup dismissed between pointerdown and pointerup.
      clearPointerDownOutside
    );
  }, [disabled2, floating, domReference, floatingFocusElement, open2, portalContext, pointerDownTimeout, getResolvedInsideElements]);
  useEffect(() => {
    if (disabled2 || !closeOnFocusOut) {
      return void 0;
    }
    const doc = ownerDocument(floatingFocusElement);
    function handlePointerDown() {
      isPointerDownRef.current = true;
      pointerDownTimeout.start(0, () => {
        isPointerDownRef.current = false;
      });
    }
    function handleFocusIn(event) {
      const target = getTarget(event);
      if (isTabbable(target)) {
        lastFocusedTabbableRef.current = target;
      }
    }
    function handleFocusOutside(event) {
      const relatedTarget = event.relatedTarget;
      const currentTarget = event.currentTarget;
      const target = getTarget(event);
      if (modal && relatedTarget == null && target != null && contains(floating, target)) {
        addPreviouslyFocusedElement(target);
      }
      queueMicrotask(() => {
        const nodeId = getNodeId();
        const triggers = store.context.triggerElements;
        const insideElements = getResolvedInsideElements();
        const isRelatedFocusGuard = relatedTarget?.hasAttribute(createAttribute("focus-guard")) && [beforeGuardRef.current, afterGuardRef.current, portalContext?.beforeInsideRef.current, portalContext?.afterInsideRef.current, portalContext?.beforeOutsideRef.current, portalContext?.afterOutsideRef.current, resolveRef(previousFocusableElement), resolveRef(nextFocusableElement)].includes(relatedTarget);
        const movedToUnrelatedNode = !(contains(domReference, relatedTarget) || contains(floating, relatedTarget) || contains(relatedTarget, floating) || contains(portalContext?.portalNode, relatedTarget) || insideElements.some((element) => element === relatedTarget || contains(element, relatedTarget)) || triggers.hasMatchingElement((trigger) => contains(trigger, relatedTarget)) || isRelatedFocusGuard || tree && (getNodeChildren(tree.nodesRef.current, nodeId).find((node) => contains(node.context?.elements.floating, relatedTarget) || contains(node.context?.elements.domReference, relatedTarget)) || getNodeAncestors(tree.nodesRef.current, nodeId).find((node) => [node.context?.elements.floating, getFloatingFocusElement(node.context?.elements.floating)].includes(relatedTarget) || node.context?.elements.domReference === relatedTarget)));
        if (currentTarget === domReference && floatingFocusElement) {
          handleTabIndex(floatingFocusElement);
        }
        if (restoreFocus && currentTarget !== domReference && !isElementVisible(target) && activeElement(doc) === doc.body) {
          if (isHTMLElement(floatingFocusElement)) {
            floatingFocusElement.focus();
            if (restoreFocus === "popup") {
              restoreFocusFrame.request(() => {
                floatingFocusElement.focus();
              });
              return;
            }
          }
          const tabbableContent = getTabbableContent();
          const prevTabbable = lastFocusedTabbableRef.current;
          const nodeToFocus = (prevTabbable && tabbableContent.includes(prevTabbable) ? prevTabbable : null) || tabbableContent[tabbableContent.length - 1] || floatingFocusElement;
          if (isHTMLElement(nodeToFocus)) {
            nodeToFocus.focus();
          }
        }
        if (dataRef.current.insideReactTree) {
          dataRef.current.insideReactTree = false;
          return;
        }
        if ((isUntrappedTypeableCombobox ? true : !modal) && relatedTarget && movedToUnrelatedNode && !isPointerDownRef.current && // Fix React 18 Strict Mode returnFocus due to double rendering.
        // For an "untrapped" typeable combobox (input role=combobox with
        // initialFocus=false), re-opening the popup and tabbing out should still close it even
        // when the previously focused element (e.g. the next tabbable outside the popup) is
        // focused again. Otherwise, the popup remains open on the second Tab sequence:
        // click input -> Tab (closes) -> click input -> Tab.
        // Allow closing when `isUntrappedTypeableCombobox` regardless of the previously focused element.
        (isUntrappedTypeableCombobox || relatedTarget !== getPreviouslyFocusedElement())) {
          preventReturnFocusRef.current = true;
          store.setOpen(false, createChangeEventDetails(reason_parts_exports.focusOut, event));
        }
      });
    }
    function markInsideReactTree() {
      if (pointerDownOutsideRef.current) {
        return;
      }
      dataRef.current.insideReactTree = true;
      blurTimeout.start(0, () => {
        dataRef.current.insideReactTree = false;
      });
    }
    const domReferenceElement = isHTMLElement(domReference) ? domReference : null;
    if (!floating && !domReferenceElement) {
      return void 0;
    }
    return mergeCleanups(domReferenceElement && addEventListener(domReferenceElement, "focusout", handleFocusOutside), domReferenceElement && addEventListener(domReferenceElement, "pointerdown", handlePointerDown), floating && addEventListener(floating, "focusin", handleFocusIn), floating && addEventListener(floating, "focusout", handleFocusOutside), floating && portalContext && addEventListener(floating, "focusout", markInsideReactTree, true));
  }, [disabled2, domReference, floating, floatingFocusElement, modal, tree, portalContext, store, closeOnFocusOut, restoreFocus, getTabbableContent, isUntrappedTypeableCombobox, getNodeId, dataRef, blurTimeout, pointerDownTimeout, restoreFocusFrame, nextFocusableElement, previousFocusableElement, getResolvedInsideElements]);
  useEffect(() => {
    if (disabled2 || !floating || !open2) {
      return void 0;
    }
    const portalNodes = Array.from(portalContext?.portalNode?.querySelectorAll(`[${createAttribute("portal")}]`) || []);
    const ancestors = tree ? getNodeAncestors(tree.nodesRef.current, getNodeId()) : [];
    const rootAncestorComboboxDomReference = ancestors.find((node) => isTypeableCombobox(node.context?.elements.domReference || null))?.context?.elements.domReference;
    const controlInsideElements = [floating, ...portalNodes, beforeGuardRef.current, afterGuardRef.current, portalContext?.beforeOutsideRef.current, portalContext?.afterOutsideRef.current, ...getResolvedInsideElements()];
    const insideElements = [...controlInsideElements, rootAncestorComboboxDomReference, resolveRef(previousFocusableElement), resolveRef(nextFocusableElement), isUntrappedTypeableCombobox ? domReference : null].filter((x) => x != null);
    const ariaHiddenCleanup = markOthers(insideElements, {
      ariaHidden: modal || isUntrappedTypeableCombobox,
      mark: false
    });
    const markerInsideElements = [floating, ...portalNodes].filter((x) => x != null);
    const markerCleanup = markOthers(markerInsideElements);
    return () => {
      markerCleanup();
      ariaHiddenCleanup();
    };
  }, [open2, disabled2, domReference, floating, modal, portalContext, isUntrappedTypeableCombobox, tree, getNodeId, nextFocusableElement, previousFocusableElement, getResolvedInsideElements]);
  useIsoLayoutEffect(() => {
    if (!open2 || disabled2 || !isHTMLElement(floatingFocusElement)) {
      return;
    }
    closeTypeRef.current = "";
    lastInteractionTypeRef.current = "";
    const doc = ownerDocument(floatingFocusElement);
    const previouslyFocusedElement = activeElement(doc);
    queueMicrotask(() => {
      const initialFocusValueOrFn = initialFocusRef.current;
      const resolvedInitialFocus = typeof initialFocusValueOrFn === "function" ? initialFocusValueOrFn(openInteractionTypeRef.current || "") : initialFocusValueOrFn;
      if (resolvedInitialFocus === void 0 || resolvedInitialFocus === false) {
        return;
      }
      const focusAlreadyInsideFloatingEl = contains(floatingFocusElement, previouslyFocusedElement);
      if (focusAlreadyInsideFloatingEl) {
        return;
      }
      let focusableElements = null;
      const getDefaultFocusElement = () => {
        if (focusableElements == null) {
          focusableElements = getTabbableContent(floatingFocusElement);
        }
        return focusableElements[0] || floatingFocusElement;
      };
      let elToFocus;
      if (resolvedInitialFocus === true || resolvedInitialFocus === null) {
        elToFocus = getDefaultFocusElement();
      } else {
        elToFocus = resolveRef(resolvedInitialFocus);
      }
      elToFocus = elToFocus || getDefaultFocusElement();
      const hadFocusInside = contains(floatingFocusElement, activeElement(doc));
      const openEvent = dataRef.current.openEvent;
      const openedByVirtualPress = openEvent?.type === "mousedown" && isVirtualClick(openEvent);
      void enqueueFocus(elToFocus, {
        sync: openedByVirtualPress,
        preventScroll: elToFocus === floatingFocusElement,
        shouldFocus() {
          if (!openRef.current) {
            return false;
          }
          if (hadFocusInside) {
            return true;
          }
          const currentActiveElement = activeElement(doc);
          const focusMovedInside = currentActiveElement !== elToFocus && contains(floatingFocusElement, currentActiveElement);
          return !focusMovedInside;
        }
      });
    });
  }, [disabled2, open2, floatingFocusElement, getTabbableContent, initialFocusRef, openInteractionTypeRef, openRef, dataRef]);
  const pendingReturnFocusRef = useRef(null);
  useIsoLayoutEffect(() => {
    if (disabled2 || !floatingFocusElement) {
      pendingReturnFocusRef.current = null;
      return void 0;
    }
    if (pendingReturnFocusRef.current) {
      pendingReturnFocusRef.current.cancelled = true;
      pendingReturnFocusRef.current = null;
    }
    const doc = ownerDocument(floatingFocusElement);
    const elementFocusedBeforeOpen = activeElement(doc);
    const preferPreviousFocus = openInteractionTypeRef.current == null;
    addPreviouslyFocusedElement(elementFocusedBeforeOpen);
    function onOpenChangeLocal(details) {
      if (!details.open) {
        closeTypeRef.current = getEventType(details.nativeEvent, lastInteractionTypeRef.current);
      }
      if (details.reason === reason_parts_exports.focusOut && details.triggerElement?.hasAttribute(createAttribute("focus-guard")) || details.reason === reason_parts_exports.triggerHover && details.nativeEvent.type === "mouseleave") {
        preventReturnFocusRef.current = true;
      }
      if (details.reason !== reason_parts_exports.outsidePress) {
        return;
      }
      if (details.nested) {
        preventReturnFocusRef.current = false;
      } else if (isVirtualClick(details.nativeEvent) || isVirtualPointerEvent(details.nativeEvent)) {
        preventReturnFocusRef.current = false;
      } else {
        let isPreventScrollSupported = false;
        ownerDocument(floatingFocusElement).createElement("div").focus({
          get preventScroll() {
            isPreventScrollSupported = true;
            return false;
          }
        });
        if (isPreventScrollSupported) {
          preventReturnFocusRef.current = false;
        } else {
          preventReturnFocusRef.current = true;
        }
      }
    }
    events.on("openchange", onOpenChangeLocal);
    function getReturnElement(closeType) {
      const returnFocusValueOrFn = returnFocusRef.current;
      let resolvedReturnFocusValue = typeof returnFocusValueOrFn === "function" ? returnFocusValueOrFn(closeType) : returnFocusValueOrFn;
      if (resolvedReturnFocusValue === void 0 || resolvedReturnFocusValue === false) {
        return null;
      }
      if (resolvedReturnFocusValue === null) {
        resolvedReturnFocusValue = true;
      }
      const referenceReturnElement = domReference?.isConnected ? domReference : null;
      const previousReturnElement = elementFocusedBeforeOpen?.isConnected && getNodeName(elementFocusedBeforeOpen) !== "body" ? elementFocusedBeforeOpen : null;
      let defaultReturnElement = preferPreviousFocus ? previousReturnElement || referenceReturnElement : referenceReturnElement || previousReturnElement;
      if (!defaultReturnElement) {
        defaultReturnElement = getPreviouslyFocusedElement() || null;
      }
      if (typeof resolvedReturnFocusValue === "boolean") {
        return defaultReturnElement;
      }
      return resolveRef(resolvedReturnFocusValue) || defaultReturnElement || null;
    }
    return () => {
      events.off("openchange", onOpenChangeLocal);
      const activeEl = activeElement(doc);
      const insideElements = getResolvedInsideElements();
      const isFocusInsideFloatingTree = contains(floating, activeEl) || insideElements.some((element) => element === activeEl || contains(element, activeEl)) || tree && getNodeChildren(tree.nodesRef.current, getNodeId(), false).some((node) => contains(node.context?.elements.floating, activeEl));
      const returnFocusValueOrFn = returnFocusRef.current;
      const closeType = closeTypeRef.current;
      const returnElement = getReturnElement(closeType);
      const job = {
        cancelled: false
      };
      pendingReturnFocusRef.current = job;
      queueMicrotask(() => {
        if (pendingReturnFocusRef.current === job) {
          pendingReturnFocusRef.current = null;
        }
        const tabbableReturnElement = getFirstTabbableElement(returnElement);
        const hasExplicitReturnFocus = (
          // eslint-disable-next-line react-hooks/exhaustive-deps
          explicitReturnFocusRef.current ?? typeof returnFocusValueOrFn !== "boolean"
        );
        if (!job.cancelled && returnFocusValueOrFn && !preventReturnFocusRef.current && isHTMLElement(tabbableReturnElement) && // If the focus moved somewhere else after mount, avoid returning focus
        // since it likely entered a different element which should be
        // respected: https://github.com/floating-ui/floating-ui/issues/2607
        (!hasExplicitReturnFocus && tabbableReturnElement !== activeEl && activeEl !== doc.body ? isFocusInsideFloatingTree : true)) {
          const focusOptions = {
            preventScroll: true
          };
          if (closeType === "keyboard") {
            focusOptions.focusVisible = true;
          }
          tabbableReturnElement.focus(focusOptions);
        }
        preventReturnFocusRef.current = false;
      });
    };
  }, [disabled2, floating, floatingFocusElement, returnFocusRef, explicitReturnFocusRef, openInteractionTypeRef, events, tree, domReference, getNodeId, getResolvedInsideElements]);
  useIsoLayoutEffect(() => {
    if (!parts_exports.engine.webkit || open2 || !floating) {
      return;
    }
    const activeEl = activeElement(ownerDocument(floating));
    if (!isHTMLElement(activeEl) || !isTypeableElement(activeEl)) {
      return;
    }
    if (contains(floating, activeEl)) {
      activeEl.blur();
    }
  }, [open2, floating]);
  useIsoLayoutEffect(() => {
    if (disabled2 || !portalContext) {
      return void 0;
    }
    portalContext.setFocusManagerState({
      modal,
      closeOnFocusOut,
      open: open2,
      onOpenChange: store.setOpen,
      domReference
    });
    return () => {
      portalContext.setFocusManagerState(null);
    };
  }, [disabled2, portalContext, modal, open2, store, closeOnFocusOut, domReference]);
  useIsoLayoutEffect(() => {
    if (disabled2 || !floatingFocusElement) {
      return void 0;
    }
    handleTabIndex(floatingFocusElement);
    return () => {
      queueMicrotask(clearDisconnectedPreviouslyFocusedElements);
    };
  }, [disabled2, floatingFocusElement]);
  const shouldRenderGuards = !disabled2 && (modal ? !isUntrappedTypeableCombobox : true) && (isInsidePortal || modal);
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [shouldRenderGuards && /* @__PURE__ */ jsx(FocusGuard, {
      "data-type": "inside",
      ref: mergedBeforeGuardRef,
      onFocus: (event) => {
        if (modal) {
          const els = getTabbableContent();
          void enqueueFocus(els[els.length - 1]);
        } else if (portalContext?.portalNode) {
          preventReturnFocusRef.current = false;
          if (isOutsideEvent(event, portalContext.portalNode)) {
            const nextTabbable = getNextTabbable(domReference);
            nextTabbable?.focus();
          } else {
            resolveRef(previousFocusableElement ?? portalContext.beforeOutsideRef)?.focus();
          }
        }
      }
    }), children, shouldRenderGuards && /* @__PURE__ */ jsx(FocusGuard, {
      "data-type": "inside",
      ref: mergedAfterGuardRef,
      onFocus: (event) => {
        if (modal) {
          void enqueueFocus(getTabbableContent()[0]);
        } else if (portalContext?.portalNode) {
          if (closeOnFocusOut) {
            preventReturnFocusRef.current = true;
          }
          if (isOutsideEvent(event, portalContext.portalNode)) {
            const prevTabbable = getPreviousTabbable(domReference);
            prevTabbable?.focus();
          } else {
            resolveRef(nextFocusableElement ?? portalContext.afterOutsideRef)?.focus();
          }
        }
      }
    })]
  });
}

// node_modules/@base-ui/react/floating-ui-react/hooks/useClick.mjs
init_react();
function useClick(store, props = {}) {
  const {
    enabled = true,
    event: eventOption = "click",
    toggle = true,
    ignoreMouse = false,
    stickIfOpen = true,
    touchOpenDelay = 0,
    reason = reason_parts_exports.triggerPress
  } = props;
  const dataRef = store.context.dataRef;
  const pointerTypeRef = useRef(void 0);
  const frame = useAnimationFrame();
  const touchOpenTimeout = useTimeout();
  const reference = useMemo(() => {
    function setOpenWithTouchDelay(nextOpen, nativeEvent, target, pointerType) {
      const details = createChangeEventDetails(reason, nativeEvent, target);
      if (nextOpen && pointerType === "touch" && touchOpenDelay > 0) {
        touchOpenTimeout.start(touchOpenDelay, () => {
          store.setOpen(true, details);
        });
      } else {
        store.setOpen(nextOpen, details);
      }
    }
    function getNextOpen(open2, currentTarget, isClickLikeOpenEvent2) {
      const openEvent = dataRef.current.openEvent;
      const hasClickedOnInactiveTrigger = store.select("domReferenceElement") !== currentTarget;
      if (open2 && hasClickedOnInactiveTrigger) {
        return true;
      }
      if (!open2) {
        return true;
      }
      if (!toggle) {
        return true;
      }
      if (openEvent && (typeof stickIfOpen === "function" ? stickIfOpen() : stickIfOpen)) {
        return !isClickLikeOpenEvent2(openEvent.type);
      }
      return false;
    }
    return {
      onPointerDown(event) {
        pointerTypeRef.current = isMouseLikePointerType(event.pointerType, true) && isVirtualPointerEvent(event.nativeEvent) ? "virtual" : event.pointerType;
      },
      onMouseDown(event) {
        const pointerType = pointerTypeRef.current;
        const nativeEvent = event.nativeEvent;
        const open2 = store.select("open");
        if (event.button !== 0 || eventOption === "click" || isMouseLikePointerType(pointerType, true) && ignoreMouse) {
          return;
        }
        const nextOpen = getNextOpen(open2, event.currentTarget, (openEventType) => openEventType === "click" || openEventType === "mousedown");
        const target = getTarget(nativeEvent);
        const isTypeable = isTypeableElement(target);
        if (isTypeable || pointerType === "virtual") {
          setOpenWithTouchDelay(nextOpen, nativeEvent, isTypeable ? target : event.currentTarget, pointerType);
          return;
        }
        const eventCurrentTarget = event.currentTarget;
        frame.request(() => {
          setOpenWithTouchDelay(nextOpen, nativeEvent, eventCurrentTarget, pointerType);
        });
      },
      onClick(event) {
        if (eventOption === "mousedown-only") {
          return;
        }
        const pointerType = pointerTypeRef.current;
        if (eventOption === "mousedown" && pointerType) {
          pointerTypeRef.current = void 0;
          return;
        }
        if (isMouseLikePointerType(pointerType, true) && ignoreMouse) {
          return;
        }
        const open2 = store.select("open");
        const nextOpen = getNextOpen(open2, event.currentTarget, (openEventType) => openEventType === "click" || openEventType === "mousedown" || openEventType === "keydown" || openEventType === "keyup");
        setOpenWithTouchDelay(nextOpen, event.nativeEvent, event.currentTarget, pointerType);
      },
      onKeyDown() {
        pointerTypeRef.current = void 0;
      }
    };
  }, [dataRef, eventOption, ignoreMouse, reason, store, stickIfOpen, toggle, frame, touchOpenTimeout, touchOpenDelay]);
  return useMemo(() => enabled ? {
    reference
  } : EMPTY_OBJECT, [enabled, reference]);
}

// node_modules/@base-ui/react/floating-ui-react/hooks/useDismiss.mjs
init_react();
function alwaysFalse() {
  return false;
}
function normalizeProp(normalizable) {
  return {
    escapeKey: typeof normalizable === "boolean" ? normalizable : normalizable?.escapeKey ?? false,
    outsidePress: typeof normalizable === "boolean" ? normalizable : normalizable?.outsidePress ?? true
  };
}
function useDismiss(store, props = {}) {
  const {
    enabled = true,
    escapeKey: escapeKey2 = true,
    outsidePress: outsidePressProp = true,
    outsidePressEvent = "sloppy",
    referencePress = alwaysFalse,
    bubbles,
    externalTree
  } = props;
  const open2 = store.useState("open");
  const floatingElement = store.useState("floatingElement");
  const {
    dataRef,
    events
  } = store.context;
  const tree = useFloatingTree(externalTree);
  const outsidePressFn = useStableCallback(typeof outsidePressProp === "function" ? outsidePressProp : () => false);
  const outsidePress2 = typeof outsidePressProp === "function" ? outsidePressFn : outsidePressProp;
  const outsidePressEnabled = outsidePress2 !== false;
  const getOutsidePressEventProp = useStableCallback(() => outsidePressEvent);
  const {
    escapeKey: escapeKeyBubbles,
    outsidePress: outsidePressBubbles
  } = normalizeProp(bubbles);
  const pressStartedInsideRef = useRef(false);
  const pressStartPreventedRef = useRef(false);
  const suppressNextOutsideClickRef = useRef(false);
  const sawPressWhileOpenRef = useRef(false);
  const isComposingRef = useRef(false);
  const currentPointerTypeRef = useRef("");
  const touchStateRef = useRef(null);
  const cancelDismissOnEndTimeout = useTimeout();
  const clearInsideReactTreeTimeout = useTimeout();
  const compositionTimeout = useTimeout();
  const clearInsideReactTree = useStableCallback(() => {
    clearInsideReactTreeTimeout.clear();
    dataRef.current.insideReactTree = false;
  });
  const hasBlockingChild = useStableCallback((bubbleKey) => {
    const nodeId = dataRef.current.floatingContext?.nodeId;
    const children = tree ? getNodeChildren(tree.nodesRef.current, nodeId) : [];
    return children.some((child) => child.context?.open && !child.context.dataRef.current[bubbleKey]);
  });
  const isEventWithinOwnElements = useStableCallback((event) => {
    return isEventTargetWithin(event, store.select("floatingElement")) || isEventTargetWithin(event, store.select("domReferenceElement"));
  });
  const closeOnReferencePress = useStableCallback((event) => {
    if (!referencePress()) {
      return;
    }
    store.setOpen(false, createChangeEventDetails(reason_parts_exports.triggerPress, event.nativeEvent));
  });
  const closeOnEscapeKeyDown = useStableCallback((event) => {
    if (!open2 || !enabled || !escapeKey2 || event.key !== "Escape") {
      return;
    }
    const native = isReactEvent(event) ? event.nativeEvent : event;
    if (isComposingRef.current || native.isComposing) {
      return;
    }
    if (!escapeKeyBubbles && hasBlockingChild("__escapeKeyBubbles")) {
      return;
    }
    const eventDetails = createChangeEventDetails(reason_parts_exports.escapeKey, native);
    store.setOpen(false, eventDetails);
    if (!eventDetails.isCanceled) {
      event.preventDefault();
    }
    if (!escapeKeyBubbles && !eventDetails.isPropagationAllowed) {
      event.stopPropagation();
    }
  });
  const markInsideReactTree = useStableCallback(() => {
    dataRef.current.insideReactTree = true;
    clearInsideReactTreeTimeout.start(0, clearInsideReactTree);
  });
  const markPressStartedInsideReactTree = useStableCallback((event) => {
    if (!open2 || !enabled || event.button !== 0) {
      return;
    }
    const target = getTarget(event.nativeEvent);
    if (!contains(store.select("floatingElement"), target)) {
      return;
    }
    if (!pressStartedInsideRef.current) {
      pressStartedInsideRef.current = true;
      pressStartPreventedRef.current = false;
    }
  });
  const markInsidePressStartPrevented = useStableCallback((event) => {
    if (!open2 || !enabled) {
      return;
    }
    if (!(event.defaultPrevented || event.nativeEvent.defaultPrevented)) {
      return;
    }
    if (pressStartedInsideRef.current) {
      pressStartPreventedRef.current = true;
    }
  });
  useEffect(() => {
    function handleOpenChange(details) {
      if (!details.open) {
        sawPressWhileOpenRef.current = false;
      }
    }
    events.on("openchange", handleOpenChange);
    return () => {
      events.off("openchange", handleOpenChange);
    };
  }, [events]);
  useEffect(() => clearInsideReactTree, [clearInsideReactTree]);
  useEffect(() => {
    if (!open2 || !enabled) {
      if (!open2) {
        sawPressWhileOpenRef.current = false;
        isComposingRef.current = false;
        currentPointerTypeRef.current = "";
        touchStateRef.current = null;
      }
      return clearInsideReactTree;
    }
    dataRef.current.__escapeKeyBubbles = escapeKeyBubbles;
    dataRef.current.__outsidePressBubbles = outsidePressBubbles;
    const preventedPressSuppressionTimeout = new Timeout();
    const doc = ownerDocument(floatingElement);
    function handleCompositionStart() {
      compositionTimeout.clear();
      isComposingRef.current = true;
    }
    function handleCompositionEnd() {
      isComposingRef.current = true;
      compositionTimeout.start(
        // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
        // Only apply to WebKit for the test to remain 0ms.
        parts_exports.engine.webkit ? 5 : 0,
        () => {
          isComposingRef.current = false;
        }
      );
    }
    function suppressImmediateOutsideClickAfterPreventedStart() {
      suppressNextOutsideClickRef.current = true;
      preventedPressSuppressionTimeout.start(0, () => {
        suppressNextOutsideClickRef.current = false;
      });
    }
    function resetPressStartState() {
      pressStartedInsideRef.current = false;
      pressStartPreventedRef.current = false;
    }
    function getOutsidePressEvent() {
      const type = currentPointerTypeRef.current;
      const computedType = type === "pen" || !type ? "mouse" : type;
      const outsidePressEventValue = getOutsidePressEventProp();
      const resolved = typeof outsidePressEventValue === "function" ? outsidePressEventValue() : outsidePressEventValue;
      if (typeof resolved === "string") {
        return resolved;
      }
      return resolved[computedType];
    }
    function shouldIgnoreEvent(event) {
      const computedOutsidePressEvent = getOutsidePressEvent();
      return computedOutsidePressEvent === "intentional" && event.type !== "click" || computedOutsidePressEvent === "sloppy" && event.type === "click";
    }
    function isEventWithinFloatingTree(event) {
      const nodeId = dataRef.current.floatingContext?.nodeId;
      const targetIsInsideChildren = tree && getNodeChildren(tree.nodesRef.current, nodeId).some((node) => isEventTargetWithin(event, node.context?.elements.floating));
      return isEventWithinOwnElements(event) || targetIsInsideChildren;
    }
    function closeOnPressOutside(event) {
      if (shouldIgnoreEvent(event)) {
        if (event.type !== "click" && !isEventWithinOwnElements(event)) {
          preventedPressSuppressionTimeout.clear();
          suppressNextOutsideClickRef.current = false;
        }
        clearInsideReactTree();
        return;
      }
      if (dataRef.current.insideReactTree) {
        clearInsideReactTree();
        return;
      }
      const target = getTarget(event);
      const inertSelector = `[${createAttribute("inert")}]`;
      const targetRoot = isElement(target) ? target.getRootNode() : null;
      const markers = Array.from((isShadowRoot(targetRoot) ? targetRoot : ownerDocument(store.select("floatingElement"))).querySelectorAll(inertSelector));
      const triggers = store.context.triggerElements;
      if (target && (triggers.hasElement(target) || triggers.hasMatchingElement((trigger) => contains(trigger, target)))) {
        return;
      }
      let targetRootAncestor = isElement(target) ? target : null;
      while (targetRootAncestor && !isLastTraversableNode(targetRootAncestor)) {
        const nextParent = getParentNode(targetRootAncestor);
        if (isLastTraversableNode(nextParent) || !isElement(nextParent)) {
          break;
        }
        targetRootAncestor = nextParent;
      }
      if (markers.length && isElement(target) && !isRootElement(target) && // Clicked on a direct ancestor (e.g. FloatingOverlay).
      !contains(target, store.select("floatingElement")) && // If the target root element contains none of the markers, then the
      // element was injected after the floating element rendered.
      markers.every((marker) => !contains(targetRootAncestor, marker))) {
        return;
      }
      if (isHTMLElement(target) && !("touches" in event)) {
        const lastTraversableNode = isLastTraversableNode(target);
        const style = getComputedStyle2(target);
        const scrollRe = /auto|scroll/;
        const isScrollableX = lastTraversableNode || scrollRe.test(style.overflowX);
        const isScrollableY = lastTraversableNode || scrollRe.test(style.overflowY);
        const canScrollX = isScrollableX && target.clientWidth > 0 && target.scrollWidth > target.clientWidth;
        const canScrollY = isScrollableY && target.clientHeight > 0 && target.scrollHeight > target.clientHeight;
        const isRTL2 = style.direction === "rtl";
        const pressedVerticalScrollbar = canScrollY && (isRTL2 ? event.offsetX <= target.offsetWidth - target.clientWidth : event.offsetX > target.clientWidth);
        const pressedHorizontalScrollbar = canScrollX && event.offsetY > target.clientHeight;
        if (pressedVerticalScrollbar || pressedHorizontalScrollbar) {
          return;
        }
      }
      if (isEventWithinFloatingTree(event)) {
        return;
      }
      if (getOutsidePressEvent() === "intentional") {
        if (event.detail !== 0 && !isVirtualClick(event) && !sawPressWhileOpenRef.current) {
          return;
        }
        if (suppressNextOutsideClickRef.current) {
          preventedPressSuppressionTimeout.clear();
          suppressNextOutsideClickRef.current = false;
          return;
        }
      }
      if (typeof outsidePress2 === "function" && !outsidePress2(event)) {
        return;
      }
      if (hasBlockingChild("__outsidePressBubbles")) {
        return;
      }
      store.setOpen(false, createChangeEventDetails(reason_parts_exports.outsidePress, event));
      clearInsideReactTree();
    }
    function handlePointerDown(event) {
      if (getOutsidePressEvent() !== "sloppy" || event.pointerType === "touch" || !store.select("open") || !enabled || isEventWithinOwnElements(event)) {
        return;
      }
      closeOnPressOutside(event);
    }
    function handleTouchStart(event) {
      if (getOutsidePressEvent() !== "sloppy" || !store.select("open") || !enabled || isEventWithinOwnElements(event)) {
        return;
      }
      const touch = event.touches[0];
      if (touch) {
        touchStateRef.current = {
          startTime: Date.now(),
          startX: touch.clientX,
          startY: touch.clientY,
          dismissOnTouchEnd: false,
          dismissOnMouseDown: true
        };
        cancelDismissOnEndTimeout.start(1e3, () => {
          if (touchStateRef.current) {
            touchStateRef.current.dismissOnTouchEnd = false;
            touchStateRef.current.dismissOnMouseDown = false;
          }
        });
      }
    }
    function addTargetEventListenerOnce(event, listener) {
      const target = getTarget(event);
      if (!target) {
        return;
      }
      const unsubscribe2 = addEventListener(target, event.type, () => {
        listener(event);
        unsubscribe2();
      });
    }
    function handleTouchStartCapture(event) {
      currentPointerTypeRef.current = "touch";
      addTargetEventListenerOnce(event, handleTouchStart);
    }
    function closeOnPressOutsideCapture(event) {
      cancelDismissOnEndTimeout.clear();
      if (event.type === "pointerdown") {
        if (event.button === 0) {
          sawPressWhileOpenRef.current = true;
        }
        currentPointerTypeRef.current = event.pointerType;
      }
      if (event.type === "mousedown" && touchStateRef.current && !touchStateRef.current.dismissOnMouseDown) {
        return;
      }
      addTargetEventListenerOnce(event, (targetEvent) => {
        if (targetEvent.type === "pointerdown") {
          handlePointerDown(targetEvent);
        } else {
          closeOnPressOutside(targetEvent);
        }
      });
    }
    function handlePressEndCapture(event) {
      if (event.type === "pointercancel") {
        sawPressWhileOpenRef.current = false;
      }
      if (!pressStartedInsideRef.current) {
        return;
      }
      const pressStartedInsideDefaultPrevented = pressStartPreventedRef.current;
      resetPressStartState();
      if (getOutsidePressEvent() !== "intentional") {
        return;
      }
      if (event.type === "pointercancel") {
        if (pressStartedInsideDefaultPrevented) {
          suppressImmediateOutsideClickAfterPreventedStart();
        }
        return;
      }
      if (isEventWithinFloatingTree(event)) {
        return;
      }
      if (pressStartedInsideDefaultPrevented) {
        suppressImmediateOutsideClickAfterPreventedStart();
        return;
      }
      if (typeof outsidePress2 === "function" && !outsidePress2(event)) {
        return;
      }
      preventedPressSuppressionTimeout.clear();
      suppressNextOutsideClickRef.current = true;
      clearInsideReactTree();
    }
    function handleTouchMove(event) {
      if (getOutsidePressEvent() !== "sloppy" || !touchStateRef.current || isEventWithinOwnElements(event)) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const deltaX = Math.abs(touch.clientX - touchStateRef.current.startX);
      const deltaY = Math.abs(touch.clientY - touchStateRef.current.startY);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance > 5) {
        touchStateRef.current.dismissOnTouchEnd = true;
      }
      if (distance > 10) {
        closeOnPressOutside(event);
        cancelDismissOnEndTimeout.clear();
        touchStateRef.current = null;
      }
    }
    function handleTouchMoveCapture(event) {
      addTargetEventListenerOnce(event, handleTouchMove);
    }
    function handleTouchEnd(event) {
      if (getOutsidePressEvent() !== "sloppy" || !touchStateRef.current || isEventWithinOwnElements(event)) {
        return;
      }
      if (touchStateRef.current.dismissOnTouchEnd) {
        closeOnPressOutside(event);
      }
      cancelDismissOnEndTimeout.clear();
      touchStateRef.current = null;
    }
    function handleTouchEndCapture(event) {
      addTargetEventListenerOnce(event, handleTouchEnd);
    }
    const unsubscribe = mergeCleanups(escapeKey2 && mergeCleanups(addEventListener(doc, "keydown", closeOnEscapeKeyDown), addEventListener(doc, "compositionstart", handleCompositionStart), addEventListener(doc, "compositionend", handleCompositionEnd)), outsidePressEnabled && mergeCleanups(addEventListener(doc, "click", closeOnPressOutsideCapture, true), addEventListener(doc, "pointerdown", closeOnPressOutsideCapture, true), addEventListener(doc, "pointerup", handlePressEndCapture, true), addEventListener(doc, "pointercancel", handlePressEndCapture, true), addEventListener(doc, "mousedown", closeOnPressOutsideCapture, true), addEventListener(doc, "mouseup", handlePressEndCapture, true), addEventListener(doc, "touchstart", handleTouchStartCapture, {
      capture: true,
      passive: true
    }), addEventListener(doc, "touchmove", handleTouchMoveCapture, {
      capture: true,
      passive: true
    }), addEventListener(doc, "touchend", handleTouchEndCapture, {
      capture: true,
      passive: true
    })));
    return () => {
      unsubscribe();
      preventedPressSuppressionTimeout.clear();
      resetPressStartState();
      suppressNextOutsideClickRef.current = false;
    };
  }, [dataRef, floatingElement, escapeKey2, outsidePressEnabled, outsidePress2, open2, enabled, escapeKeyBubbles, outsidePressBubbles, closeOnEscapeKeyDown, clearInsideReactTree, getOutsidePressEventProp, hasBlockingChild, isEventWithinOwnElements, tree, store, cancelDismissOnEndTimeout, compositionTimeout]);
  const reference = useMemo(() => ({
    onKeyDown: closeOnEscapeKeyDown,
    onPointerDown: closeOnReferencePress,
    onClick: closeOnReferencePress
  }), [closeOnEscapeKeyDown, closeOnReferencePress]);
  const floating = useMemo(() => ({
    onKeyDown: closeOnEscapeKeyDown,
    // `onMouseDown` may be blocked if `event.preventDefault()` is called in
    // `onPointerDown`, such as with <NumberField.ScrubArea>.
    // See https://github.com/mui/base-ui/pull/3379
    onPointerDown: markInsidePressStartPrevented,
    onMouseDown: markInsidePressStartPrevented,
    onClickCapture: markInsideReactTree,
    onMouseDownCapture(event) {
      markInsideReactTree();
      markPressStartedInsideReactTree(event);
    },
    onPointerDownCapture(event) {
      markInsideReactTree();
      markPressStartedInsideReactTree(event);
    },
    onMouseUpCapture: markInsideReactTree,
    onTouchEndCapture: markInsideReactTree,
    onTouchMoveCapture: markInsideReactTree
  }), [closeOnEscapeKeyDown, markInsideReactTree, markPressStartedInsideReactTree, markInsidePressStartPrevented]);
  return useMemo(() => enabled ? {
    reference,
    floating,
    trigger: reference
  } : {}, [enabled, reference, floating]);
}

// node_modules/@base-ui/react/utils/popups/popupHandle.mjs
var BasePopupHandle = class {
  /**
   * Stores of every root currently using this handle, in attach order. A handle is meant to be used
   * by a single mounted root, but roots can transiently overlap (e.g. during an animated route
   * transition), so this stack lets `attachStore`'s cleanup restore the previous root instead of
   * leaving a still-mounted root uncontrollable when a newer overlapping root detaches first.
   */
  attachedStores = [];
  /**
   * Store of the root that currently controls the handle: the most recently attached one still
   * mounted, or `null` when no root is attached. Imperative methods are no-ops while this is `null`.
   */
  attachedStoreValue = null;
  /**
   * Listeners notified when `attachedStore` changes, so detached triggers can follow the store pointer.
   */
  storeListeners = /* @__PURE__ */ new Set();
  /**
   * Creates a handle backed by the store used while no root is attached.
   *
   * @param fallbackStore Inert, closed store handed to detached triggers while no root is attached,
   * so they can render and register without a mounted root. Triggers register into whichever store
   * `store` currently resolves to, so while detached they live in this store's trigger map and
   * migrate themselves to the root's store (and back) as it attaches/detaches.
   * @param componentName Component name used to prefix dev warnings, e.g. `'Menu'` produces
   * `MenuHandle.open()` in warning text.
   * @param throwOnMissingTrigger Whether `open(triggerId)` throws when no trigger with that id is
   * registered. Anchored popups (Menu, Popover, Tooltip, PreviewCard) need a trigger to anchor to,
   * so they throw; Dialog is not anchored and instead opens unassociated with a dev warning.
   */
  constructor(fallbackStore, componentName, throwOnMissingTrigger = true) {
    this.fallbackStore = fallbackStore;
    this.componentName = componentName;
    this.throwOnMissingTrigger = throwOnMissingTrigger;
  }
  get attachedStore() {
    return this.attachedStoreValue;
  }
  /**
   * Store that detached triggers read from: the attached root's store, or an inert fallback store
   * used while no root is attached.
   * @internal
   */
  get store() {
    return this.attachedStoreValue ?? this.fallbackStore;
  }
  /**
   * Stable fallback store used for server rendering and hydration. Root stores cannot be recorded on
   * the handle during render because a handle can be shared by concurrent server-rendered requests.
   * @internal
   */
  get serverStore() {
    return this.fallbackStore;
  }
  /**
   * Subscribes to changes of the attached store pointer so detached triggers re-render and re-bind
   * when a root attaches or detaches. Returns a function that removes the listener.
   * @internal
   */
  subscribeStore(listener) {
    this.storeListeners.add(listener);
    return () => {
      this.storeListeners.delete(listener);
    };
  }
  /**
   * Points the handle at a root's store and notifies subscribers so detached triggers re-render and
   * re-register into it (their registration effect migrates them when the store pointer changes).
   * Returns a cleanup function that detaches the store again.
   * @internal
   */
  attachStore(newStore) {
    this.attachedStores.push(newStore);
    this.setActiveStore(newStore);
    if (false) {
      if (this.attachedStores.length > 1) {
        const dev = this;
        (dev.overlapWarningFrame ??= AnimationFrame.create()).request(() => {
          if (this.attachedStores.length > 1) {
            console.warn("Base UI: A handle is attached to more than one mounted root at the same time. The most recently mounted root takes over and the previous one stops being controlled by the handle. A handle should be used by a single root that stays mounted for the lifetime of the handle.");
          }
        });
      }
    }
    return () => {
      const index2 = this.attachedStores.lastIndexOf(newStore);
      if (index2 !== -1) {
        this.attachedStores.splice(index2, 1);
      }
      this.setActiveStore(this.attachedStores[this.attachedStores.length - 1] ?? null);
    };
  }
  /**
   * Sets the store that currently controls the handle and notifies subscribers when it changes, so
   * detached triggers re-render and migrate their registration to the new store.
   */
  setActiveStore(store) {
    if (this.attachedStoreValue !== store) {
      this.attachedStoreValue = store;
      this.storeListeners.forEach((listener) => {
        listener();
      });
    }
  }
  /**
   * Opens the attached root's store and associates it with the trigger with the given id, or a
   * no-op (with a dev warning) while no root is attached. Shared by every concrete handle's public
   * `open()` method, which only narrows the parameter type.
   *
   * When a trigger id is given but no matching trigger is registered, anchored popups throw (see
   * `throwOnMissingTrigger`); Dialog opens unassociated with a dev warning instead.
   *
   * This method should only be called in an event handler or an effect (not during rendering).
   *
   * @param triggerId ID of the trigger to associate with the popup, or `null`/`undefined` to open
   * without associating any trigger.
   */
  openByTrigger(triggerId) {
    const attachedStore = this.attachedStore;
    if (attachedStore === null) {
      if (false) {
        console.warn(`Base UI: ${this.componentName}Handle.open() was called while no root using this handle is mounted. The call was ignored; mount a root with this handle before opening it imperatively.`);
      }
      return;
    }
    let triggerElement;
    if (triggerId) {
      for (let i = this.attachedStores.length - 1; i >= 0 && !triggerElement; i -= 1) {
        triggerElement = this.attachedStores[i].context.triggerElements.getById(triggerId);
      }
      triggerElement ??= this.fallbackStore.context.triggerElements.getById(triggerId);
    }
    if (triggerId && !triggerElement) {
      if (this.throwOnMissingTrigger) {
        throw new Error(false ? `Base UI: ${this.componentName}Handle.open() was called with the trigger id "${triggerId}", but no matching trigger is registered with this handle. An anchored popup cannot open without a trigger to anchor to. Pass the id of a mounted ${this.componentName}.Trigger that has this handle set on its "handle" prop.` : formatErrorMessage_default(99, this.componentName, triggerId, this.componentName));
      }
      if (false) {
        console.warn(`Base UI: ${this.componentName}Handle.open: No trigger found with id "${triggerId}". The popup will open, but the trigger will not be associated with it.`);
      }
    }
    attachedStore.setOpen(true, createChangeEventDetails(reason_parts_exports.imperativeAction, void 0, triggerElement));
  }
  /**
   * Closes the popup by setting the attached root's store to closed, or a no-op (with a dev warning)
   * while no root is attached. Shared by every concrete handle's public `close()` method.
   *
   * This method should only be called in an event handler or an effect (not during rendering).
   */
  closePopup() {
    const attachedStore = this.attachedStore;
    if (attachedStore === null) {
      if (false) {
        console.warn(`Base UI: ${this.componentName}Handle.close() was called while no root using this handle is mounted. The call was ignored.`);
      }
      return;
    }
    attachedStore.setOpen(false, createChangeEventDetails(reason_parts_exports.imperativeAction));
  }
};

// node_modules/@base-ui/react/utils/popups/popupStoreUtils.mjs
init_react();

// node_modules/@base-ui/react/floating-ui-react/hooks/useSyncedFloatingRootContext.mjs
function useSyncedFloatingRootContext(options) {
  const {
    popupStore,
    treatPopupAsFloatingElement = false,
    floatingRootContext: store,
    floatingId,
    nested,
    onOpenChange
  } = options;
  const open2 = popupStore.useState("open");
  const referenceElement = popupStore.useState("activeTriggerElement");
  const floatingElement = popupStore.useState(treatPopupAsFloatingElement ? "popupElement" : "positionerElement");
  const handleOpenChange = onOpenChange;
  popupStore.useSyncedValue("floatingId", floatingId);
  useIsoLayoutEffect(() => {
    const valuesToSync = {
      open: open2,
      floatingId,
      referenceElement,
      floatingElement
    };
    if (isElement(referenceElement)) {
      valuesToSync.domReferenceElement = referenceElement;
    }
    if (store.state.positionReference === store.state.referenceElement) {
      valuesToSync.positionReference = referenceElement;
    }
    store.update(valuesToSync);
  }, [open2, floatingId, referenceElement, floatingElement, store]);
  store.context.onOpenChange = handleOpenChange;
  store.context.nested = nested;
  return store;
}

// node_modules/@base-ui/react/internals/useUnmountAfterClose.mjs
init_react();
function useUnmountAfterClose(parameters) {
  const {
    open: open2,
    ref,
    preventUnmountOnClose,
    setPreventUnmountOnClose: setPreventUnmountOnCloseParam,
    onUnmount,
    animateInitialOpen
  } = parameters;
  const setPreventUnmountOnClose = useStableCallback(setPreventUnmountOnCloseParam);
  const {
    mounted,
    setMounted,
    transitionStatus
  } = useTransitionStatus(open2, false, false, animateInitialOpen);
  const preventUnmountingOnClose = open2 ? false : preventUnmountOnClose;
  useIsoLayoutEffect(() => {
    if (open2) {
      setPreventUnmountOnClose(false);
    }
  }, [open2, setPreventUnmountOnClose]);
  const mountedRef = useRef(mounted);
  const pendingUnmountRef = useRef(false);
  const rerender = useForcedRerendering();
  const unmount = () => {
    mountedRef.current = false;
    setMounted(false);
    onUnmount();
  };
  useIsoLayoutEffect(() => {
    mountedRef.current = mounted;
    if (pendingUnmountRef.current) {
      pendingUnmountRef.current = false;
      if (!open2 && mounted) {
        unmount();
      }
    }
  });
  const forceUnmount = useStableCallback(() => {
    if (!mountedRef.current) {
      return;
    }
    if (open2) {
      pendingUnmountRef.current = true;
      rerender();
      return;
    }
    unmount();
  });
  useOpenChangeComplete({
    enabled: mounted && !open2 && !preventUnmountingOnClose,
    open: open2,
    ref,
    onComplete() {
      if (!open2) {
        forceUnmount();
      }
    }
  });
  return {
    mounted,
    transitionStatus,
    preventUnmountingOnClose,
    forceUnmount
  };
}

// node_modules/@base-ui/react/utils/popups/popupStoreUtils.mjs
var FOCUSABLE_POPUP_PROPS = {
  tabIndex: -1,
  [FOCUSABLE_ATTRIBUTE]: ""
};
function createDefaultInitialFocus(popupRef) {
  return (interactionType) => interactionType === "touch" ? popupRef.current : true;
}
function usePopupRootStore(createStore, treatPopupAsFloatingElement = false) {
  const floatingId = useId2();
  const nested = useFloatingParentNodeId() != null;
  const store = useRefWithInit(() => createStore(floatingId, nested)).current;
  useSyncedFloatingRootContext({
    popupStore: store,
    treatPopupAsFloatingElement,
    floatingRootContext: store.state.floatingRootContext,
    floatingId,
    nested,
    onOpenChange: store.setOpen
  });
  return store;
}
function PopupHandleAttachment({
  handle,
  store
}) {
  useIsoLayoutEffect(() => {
    return handle.attachStore(store);
  }, [handle, store]);
  return null;
}
function syncTriggerCount(store) {
  const triggerCount = store.context.triggerElements.size;
  if (store.select("open") && store.state.triggerCount !== triggerCount) {
    store.set("triggerCount", triggerCount);
  }
}
function useTriggerRegistration(id, store) {
  const registrationRef = useRef(null);
  return useStableCallback((element) => {
    const registration = registrationRef.current;
    if (registration !== null) {
      if (registration.element === element && registration.store === store && registration.id === id) {
        return;
      }
      registrationRef.current = null;
      const registeredStore = registration.store;
      if (registeredStore.context.triggerElements.getById(registration.id) === registration.element) {
        registeredStore.context.triggerElements.delete(registration.id);
        syncTriggerCount(registeredStore);
      }
    }
    if (element !== null && id !== void 0) {
      registrationRef.current = {
        store,
        id,
        element
      };
      store.context.triggerElements.add(id, element);
      syncTriggerCount(store);
    }
  });
}
function createPopupOpenState(state, open2, trigger, preventUnmountOnClose = false) {
  let preventUnmountingOnClose = state.preventUnmountingOnClose;
  if (open2) {
    preventUnmountingOnClose = false;
  } else if (preventUnmountOnClose) {
    preventUnmountingOnClose = true;
  }
  const triggerId = trigger?.id ?? null;
  let activeTriggerId = state.activeTriggerId;
  let activeTriggerElement = state.activeTriggerElement;
  if (triggerId || open2) {
    activeTriggerId = triggerId;
    activeTriggerElement = trigger ?? null;
  }
  return {
    open: open2,
    preventUnmountingOnClose,
    activeTriggerId,
    activeTriggerElement,
    // An open request without a trigger (a handle's `open(null)` or `openWithPayload()`) must not
    // be reassociated with a lone registered trigger later on. Controlled and default opens never
    // pass through here, so they keep claiming a lone trigger. A close request keeps the flag: a
    // controlled root may decline it and stay open, so the Root clears the flag only once the
    // popup is effectively closed.
    openedWithoutTrigger: open2 ? trigger == null : state.openedWithoutTrigger
  };
}
function attachPreventUnmountOnClose(eventDetails) {
  let preventUnmountOnClose = false;
  eventDetails.preventUnmountOnClose = () => {
    preventUnmountOnClose = true;
  };
  return () => preventUnmountOnClose;
}
function useTriggerDataForwarding(triggerId, triggerElementRef, store, stateUpdates) {
  const isMountedByThisTrigger = store.useState("isMountedByTrigger", triggerId);
  const baseRegisterTrigger = useTriggerRegistration(triggerId, store);
  const applyTriggerData = useStableCallback((element) => {
    const open2 = store.select("open");
    const activeTriggerId = store.select("activeTriggerId");
    if (activeTriggerId === triggerId) {
      const changes = {
        activeTriggerElement: element,
        ...open2 ? stateUpdates : null
      };
      store.update(changes);
      return;
    }
    if (activeTriggerId == null && open2 && !store.state.openedWithoutTrigger) {
      const changes = {
        activeTriggerId: triggerId ?? null,
        activeTriggerElement: element,
        ...stateUpdates
      };
      store.update(changes);
    }
  });
  const registerTrigger = useStableCallback((element) => {
    baseRegisterTrigger(element);
    if (element) {
      applyTriggerData(element);
    }
  });
  useIsoLayoutEffect(() => {
    registerTrigger(triggerElementRef.current);
    return () => registerTrigger(null);
  }, [registerTrigger, triggerElementRef, store, triggerId]);
  useIsoLayoutEffect(() => {
    if (isMountedByThisTrigger) {
      const changes = {
        activeTriggerElement: triggerElementRef.current,
        ...stateUpdates
      };
      store.update(changes);
    }
  }, [isMountedByThisTrigger, store, triggerElementRef, ...Object.values(stateUpdates)]);
  return {
    registerTrigger,
    isMountedByThisTrigger
  };
}
function useImplicitActiveTrigger(store, options = {}) {
  const {
    closeOnActiveTriggerUnmount = false
  } = options;
  const resolvedActiveTriggerIdRef = useRef(null);
  const open2 = store.useState("open");
  const reactiveTriggerCount = store.useState("triggerCount");
  const activeTriggerId = store.useState("activeTriggerId");
  const reactiveActiveTriggerElement = store.useState("activeTriggerElement");
  useIsoLayoutEffect(() => {
    if (!open2) {
      resolvedActiveTriggerIdRef.current = null;
      if (store.state.triggerCount !== 0) {
        store.set("triggerCount", 0);
      }
      if (store.state.openedWithoutTrigger) {
        store.set("openedWithoutTrigger", false);
      }
      return;
    }
    const triggerCount = store.context.triggerElements.size;
    const stateUpdates = {};
    if (store.state.triggerCount !== triggerCount) {
      stateUpdates.triggerCount = triggerCount;
    }
    const currentActiveTriggerId = store.select("activeTriggerId");
    let lostActiveTriggerId = null;
    if (currentActiveTriggerId) {
      const activeTriggerElement = store.context.triggerElements.getById(currentActiveTriggerId);
      if (!activeTriggerElement) {
        for (const [triggerId, triggerElement] of store.context.triggerElements.entries()) {
          if (triggerElement === store.state.activeTriggerElement) {
            stateUpdates.activeTriggerId = triggerId;
            stateUpdates.activeTriggerElement = triggerElement;
            resolvedActiveTriggerIdRef.current = triggerId;
            break;
          }
        }
        if (stateUpdates.activeTriggerId === void 0) {
          if (resolvedActiveTriggerIdRef.current === currentActiveTriggerId) {
            lostActiveTriggerId = currentActiveTriggerId;
          } else {
            resolvedActiveTriggerIdRef.current = null;
          }
        }
      } else {
        resolvedActiveTriggerIdRef.current = currentActiveTriggerId;
        if (activeTriggerElement !== store.state.activeTriggerElement) {
          stateUpdates.activeTriggerElement = activeTriggerElement;
        }
      }
    } else {
      resolvedActiveTriggerIdRef.current = null;
    }
    if (!lostActiveTriggerId && !currentActiveTriggerId && !store.state.openedWithoutTrigger && triggerCount === 1) {
      const iteratorResult = store.context.triggerElements.entries().next();
      if (!iteratorResult.done) {
        const [implicitTriggerId, implicitTriggerElement] = iteratorResult.value;
        stateUpdates.activeTriggerId = implicitTriggerId;
        stateUpdates.activeTriggerElement = implicitTriggerElement;
        resolvedActiveTriggerIdRef.current = implicitTriggerId;
      }
    }
    if (stateUpdates.triggerCount !== void 0 || stateUpdates.activeTriggerId !== void 0 || stateUpdates.activeTriggerElement !== void 0) {
      store.update(stateUpdates);
    }
    if (lostActiveTriggerId) {
      if (closeOnActiveTriggerUnmount) {
        queueMicrotask(() => {
          if (store.select("open") && store.select("activeTriggerId") === lostActiveTriggerId && !store.context.triggerElements.getById(lostActiveTriggerId)) {
            const eventDetails = createChangeEventDetails(reason_parts_exports.none);
            store.setOpen(false, eventDetails);
            if (!eventDetails.isCanceled) {
              store.update({
                activeTriggerId: null,
                activeTriggerElement: null
              });
            }
          }
        });
      }
    }
  }, [open2, store, reactiveTriggerCount, activeTriggerId, reactiveActiveTriggerElement, closeOnActiveTriggerUnmount]);
}
function useOpenStateTransitions(open2, store, onUnmount, animateInitialOpen) {
  const {
    mounted,
    transitionStatus,
    forceUnmount
  } = useUnmountAfterClose({
    open: open2,
    ref: store.context.popupRef,
    preventUnmountOnClose: store.useState("preventUnmountingOnClose"),
    setPreventUnmountOnClose: (preventUnmountOnClose) => store.set("preventUnmountingOnClose", preventUnmountOnClose),
    animateInitialOpen,
    onUnmount() {
      store.update({
        activeTriggerId: null,
        activeTriggerElement: null,
        mounted: false,
        preventUnmountingOnClose: false
      });
      onUnmount?.();
      store.context.onOpenChangeComplete?.(false);
    }
  });
  useRefWithInit(() => {
    store.set("mounted", mounted);
    return null;
  });
  store.useSyncedValues({
    mounted,
    transitionStatus
  });
  return {
    forceUnmount,
    transitionStatus
  };
}
function usePopupInteractionProps(store, statePart) {
  store.useSyncedValues(statePart);
  useIsoLayoutEffect(() => () => {
    store.update({
      activeTriggerProps: EMPTY_OBJECT,
      inactiveTriggerProps: EMPTY_OBJECT,
      popupProps: EMPTY_OBJECT
    });
  }, [store]);
}
function usePopupRootSync(store, open2) {
  useIsoLayoutEffect(() => {
    if (!open2 && store.state.openMethod !== null) {
      store.set("openMethod", null);
    }
  }, [open2, store]);
  useIsoLayoutEffect(() => () => {
    if (store.state.openMethod !== null) {
      store.set("openMethod", null);
    }
  }, [store]);
}

// node_modules/@base-ui/react/utils/popups/popupTriggerMap.mjs
var PopupTriggerMap = class {
  idMap = /* @__PURE__ */ new Map();
  /**
   * Adds a trigger element with the given ID.
   *
   * Note: The provided element is assumed to not be registered under multiple IDs.
   */
  add(id, element) {
    if (false) {
      const elementIds = getDevElementIds(this);
      const existingId = elementIds.get(element);
      if (existingId !== void 0 && existingId !== id) {
        throw new Error("Base UI: A trigger element cannot be registered under multiple IDs in PopupTriggerMap.");
      }
      const previousElement = this.idMap.get(id);
      if (previousElement !== void 0 && previousElement !== element) {
        elementIds.delete(previousElement);
      }
      elementIds.set(element, id);
    }
    this.idMap.set(id, element);
  }
  /**
   * Removes the trigger element with the given ID.
   */
  delete(id) {
    if (false) {
      const element = this.idMap.get(id);
      if (element !== void 0) {
        devElementIdsByMap?.get(this)?.delete(element);
      }
    }
    this.idMap.delete(id);
  }
  /**
   * Whether the given element is registered as a trigger.
   */
  hasElement(element) {
    for (const registered of this.idMap.values()) {
      if (registered === element) {
        return true;
      }
    }
    return false;
  }
  /**
   * Whether there is a registered trigger element matching the given predicate.
   */
  hasMatchingElement(predicate) {
    for (const element of this.idMap.values()) {
      if (predicate(element)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Returns the trigger element associated with the given ID, or undefined if no such element exists.
   */
  getById(id) {
    return this.idMap.get(id);
  }
  /**
   * Returns an iterable of all registered trigger entries, where each entry is a tuple of [id, element].
   */
  entries() {
    return this.idMap.entries();
  }
  /**
   * Returns an iterable of all registered trigger elements.
   */
  elements() {
    return this.idMap.values();
  }
  /**
   * Returns the number of registered trigger elements.
   */
  get size() {
    return this.idMap.size;
  }
};

// node_modules/@base-ui/utils/store/useStore.mjs
init_react();
var import_shim = __toESM(require_shim(), 1);
var import_with_selector = __toESM(require_with_selector(), 1);

// node_modules/@base-ui/utils/fastHooks.mjs
init_react();
var hooks = [];
var currentInstance = void 0;
function getInstance() {
  return currentInstance;
}
function register(hook) {
  hooks.push(hook);
}
function fastComponent(fn) {
  const FastComponent = (props, forwardedRef) => {
    const instance = useRefWithInit(createInstance).current;
    let result;
    try {
      currentInstance = instance;
      for (const hook of hooks) {
        hook.before(instance);
      }
      result = fn(props, forwardedRef);
      for (const hook of hooks) {
        hook.after(instance);
      }
      instance.didInitialize = true;
    } finally {
      currentInstance = void 0;
    }
    return result;
  };
  FastComponent.displayName = fn.displayName || fn.name;
  return FastComponent;
}
function fastComponentRef(fn) {
  return /* @__PURE__ */ forwardRef(fastComponent(fn));
}
function createInstance() {
  return {
    didInitialize: false
  };
}

// node_modules/@base-ui/utils/store/useStore.mjs
var canUseRawUseSyncExternalStore = isReactVersionAtLeast(19);
var useStoreImplementation = canUseRawUseSyncExternalStore ? useStoreFast : useStoreLegacy;
function useStore(store, selector, a1, a2, a3) {
  return useStoreImplementation(store, selector, a1, a2, a3);
}
function useStoreR19(store, selector, a1, a2, a3) {
  const getSelection = useCallback(() => selector(store.getSnapshot(), a1, a2, a3), [store, selector, a1, a2, a3]);
  return (0, import_shim.useSyncExternalStore)(store.subscribe, getSelection, getSelection);
}
register({
  before(instance) {
    instance.syncIndex = 0;
    if (!instance.didInitialize) {
      instance.syncTick = 1;
      instance.syncHooks = [];
      instance.didChangeStore = true;
      instance.getSnapshot = () => {
        let didChange2 = false;
        for (let i = 0; i < instance.syncHooks.length; i += 1) {
          const hook = instance.syncHooks[i];
          const value = hook.selector(hook.store.state, hook.a1, hook.a2, hook.a3);
          if (!Object.is(hook.value, value)) {
            didChange2 = true;
            hook.value = value;
          }
        }
        if (didChange2) {
          instance.syncTick += 1;
        }
        return instance.syncTick;
      };
    }
  },
  after(instance) {
    if (instance.syncHooks.length > 0) {
      if (instance.didChangeStore) {
        instance.didChangeStore = false;
        instance.subscribe = (onStoreChange) => {
          const stores = /* @__PURE__ */ new Set();
          for (const hook of instance.syncHooks) {
            stores.add(hook.store);
          }
          const unsubscribes = [];
          for (const store of stores) {
            unsubscribes.push(store.subscribe(onStoreChange));
          }
          return () => {
            for (const unsubscribe of unsubscribes) {
              unsubscribe();
            }
          };
        };
      }
      (0, import_shim.useSyncExternalStore)(instance.subscribe, instance.getSnapshot, instance.getSnapshot);
    }
  }
});
function useStoreFast(store, selector, a1, a2, a3) {
  const instance = getInstance();
  if (!instance) {
    return useStoreR19(store, selector, a1, a2, a3);
  }
  const index2 = instance.syncIndex;
  instance.syncIndex += 1;
  let hook;
  if (!instance.didInitialize) {
    hook = {
      store,
      selector,
      a1,
      a2,
      a3,
      value: selector(store.getSnapshot(), a1, a2, a3)
    };
    instance.syncHooks.push(hook);
  } else {
    hook = instance.syncHooks[index2];
    if (hook.store !== store || hook.selector !== selector || !Object.is(hook.a1, a1) || !Object.is(hook.a2, a2) || !Object.is(hook.a3, a3)) {
      if (hook.store !== store) {
        instance.didChangeStore = true;
      }
      hook.store = store;
      hook.selector = selector;
      hook.a1 = a1;
      hook.a2 = a2;
      hook.a3 = a3;
      hook.value = selector(store.getSnapshot(), a1, a2, a3);
    }
  }
  return hook.value;
}
function useStoreLegacy(store, selector, a1, a2, a3) {
  return (0, import_with_selector.useSyncExternalStoreWithSelector)(store.subscribe, store.getSnapshot, store.getSnapshot, (state) => selector(state, a1, a2, a3));
}

// node_modules/@base-ui/utils/store/Store.mjs
var Store = class {
  /**
   * Creates a store with the given initial state, constructing the class it is called on.
   * Calling it on a generic base class (e.g. `ReactStore.create(...)`) constructs that
   * class but degrades the inferred instance type to `Store`; use `new` there instead.
   */
  static create(state) {
    return new this(state);
  }
  /**
   * The current state of the store.
   * This property is updated immediately when the state changes as a result of calling {@link setState}, {@link update}, or {@link set}.
   * To subscribe to state changes, use the {@link useState} method. The value returned by {@link useState} is updated after the component renders (similarly to React's useState).
   * The values can be used directly (to avoid subscribing to the store) in effects or event handlers.
   *
   * Do not modify properties in state directly. Instead, use the provided methods to ensure proper state management and listener notification.
   */
  // Internal state to handle recursive `setState()` calls
  constructor(state) {
    this.state = state;
    this.listeners = /* @__PURE__ */ new Set();
    this.updateTick = 0;
  }
  /**
   * Registers a listener that will be called whenever the store's state changes.
   *
   * @param fn The listener function to be called on state changes.
   * @returns A function to unsubscribe the listener.
   */
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  /**
   * Returns the current state of the store.
   */
  getSnapshot = () => {
    return this.state;
  };
  /**
   * Updates the entire store's state and notifies all registered listeners.
   *
   * @param newState The new state to set for the store.
   */
  setState(newState) {
    if (this.state === newState) {
      return;
    }
    this.state = newState;
    this.updateTick += 1;
    const currentTick = this.updateTick;
    for (const listener of this.listeners) {
      if (currentTick !== this.updateTick) {
        return;
      }
      listener(newState);
    }
  }
  /**
   * Merges the provided changes into the current state and notifies listeners if there are changes.
   * Each value must match its state key. Pass an exact known subset rather than a broad
   * `Partial<State>`, which may contain `undefined` for required state fields.
   *
   * @param changes An object containing the changes to apply to the current state.
   */
  update(changes) {
    for (const key in changes) {
      if (!Object.is(this.state[key], changes[key])) {
        this.setState({
          ...this.state,
          ...changes
        });
        return;
      }
    }
  }
  /**
   * Sets a specific key in the store's state to a new value and notifies listeners if the value has changed.
   *
   * @param key The key in the store's state to update.
   * @param value The new value to set for the specified key.
   */
  set(key, value) {
    if (!Object.is(this.state[key], value)) {
      this.setState({
        ...this.state,
        [key]: value
      });
    }
  }
  /**
   * Gives the state a new reference and updates all registered listeners.
   */
  notifyAll() {
    const newState = {
      ...this.state
    };
    this.setState(newState);
  }
  use(selector, a1, a2, a3) {
    return useStore(this, selector, a1, a2, a3);
  }
};

// node_modules/@base-ui/utils/store/ReactStore.mjs
init_react();
var ReactStore = class extends Store {
  /**
   * Creates a new ReactStore instance.
   *
   * @param state Initial state of the store.
   * @param context Non-reactive context values.
   * @param selectors Optional selectors for use with `useState`.
   */
  constructor(state, context = {}, selectors5) {
    super(state);
    this.context = context;
    this.selectors = selectors5;
  }
  /**
   * Non-reactive values such as refs, callbacks, etc.
   */
  /**
   * Synchronizes a single external value into the store.
   *
   * Note that the while the value in `state` is updated immediately, the value returned
   * by `useState` is updated before the next render (similarly to React's `useState`).
   */
  useSyncedValue(key, value) {
    useDebugValue(key);
    const store = this;
    useIsoLayoutEffect(() => {
      if (store.state[key] !== value) {
        store.set(key, value);
      }
    }, [store, key, value]);
  }
  /**
   * Synchronizes a single external value into the store and
   * cleans it up (sets to `undefined`) on unmount.
   *
   * Note that the while the value in `state` is updated immediately, the value returned
   * by `useState` is updated before the next render (similarly to React's `useState`).
   */
  useSyncedValueWithCleanup(key, value) {
    const store = this;
    useIsoLayoutEffect(() => {
      if (store.state[key] !== value) {
        store.set(key, value);
      }
      return () => {
        store.set(key, void 0);
      };
    }, [store, key, value]);
  }
  /**
   * Synchronizes multiple external values into the store.
   * Each value must match its state key. Pass an exact known subset rather than a broad
   * `Partial<State>`, which may contain `undefined` for required state fields.
   *
   * Note that the while the values in `state` are updated immediately, the values returned
   * by `useState` are updated before the next render (similarly to React's `useState`).
   *
   * @param statePart An exact subset of state fields to synchronize. Unknown keys are not accepted.
   */
  useSyncedValues(statePart) {
    const store = this;
    if (false) {
      useDebugValue(statePart, (p) => Object.keys(p));
      const keys = useRef(Object.keys(statePart)).current;
      const nextKeys = Object.keys(statePart);
      if (keys.length !== nextKeys.length || keys.some((key, index2) => key !== nextKeys[index2])) {
        console.error("ReactStore.useSyncedValues expects the same prop keys on every render. Keys should be stable.");
      }
    }
    const dependencies = Object.values(statePart);
    useIsoLayoutEffect(() => {
      store.update(statePart);
    }, [store, ...dependencies]);
  }
  /**
   * Registers a controllable prop pair (`controlled`, `defaultValue`) for a specific key. If `controlled`
   * is non-undefined, the store's state at `key` is updated to match `controlled`.
   */
  useControlledProp(key, controlled) {
    useDebugValue(key);
    const store = this;
    const isControlled = controlled !== void 0;
    useIsoLayoutEffect(() => {
      if (isControlled && !Object.is(store.state[key], controlled)) {
        store.setState({
          ...store.state,
          [key]: controlled
        });
      }
    }, [store, key, controlled, isControlled]);
    if (false) {
      const cache2 = this.controlledValues ??= /* @__PURE__ */ new Map();
      if (!cache2.has(key)) {
        cache2.set(key, isControlled);
      }
      const previouslyControlled = cache2.get(key);
      if (previouslyControlled !== void 0 && previouslyControlled !== isControlled) {
        console.error(`A component is changing the ${previouslyControlled ? "" : "un"}controlled state of ${key.toString()} to be ${previouslyControlled ? "un" : ""}controlled. Elements should not switch from uncontrolled to controlled (or vice versa).`);
      }
    }
  }
  /** Gets the current value from the store using a selector with the provided key.
   *
   * @param key Key of the selector to use.
   */
  select(key, a1, a2, a3) {
    const selector = this.selectors[key];
    return selector(this.state, a1, a2, a3);
  }
  /**
   * Returns a value from the store's state using a selector function.
   * Used to subscribe to specific parts of the state.
   * This methods causes a rerender whenever the selected state changes.
   *
   * @param key Key of the selector to use.
   */
  useState(key, a1, a2, a3) {
    useDebugValue(key);
    return useStore(this, this.selectors[key], a1, a2, a3);
  }
  /**
   * Wraps a function with `useStableCallback` to ensure it has a stable reference
   * and assigns it to the context.
   *
   * @param key Key of the event callback. Must be a function in the context.
   * @param fn Function to assign.
   */
  useContextCallback(key, fn) {
    useDebugValue(key);
    const stableFunction = useStableCallback(fn ?? NOOP);
    this.context[key] = stableFunction;
  }
  /**
   * Returns a stable setter function for a specific key in the store's state.
   * It's commonly used to pass as a ref callback to React elements.
   *
   * @param key Key of the state to set.
   */
  useStateSetter(key) {
    const ref = useRef(void 0);
    if (ref.current === void 0) {
      ref.current = (value) => {
        this.set(key, value);
      };
    }
    return ref.current;
  }
  /**
   * Observes changes derived from the store's selectors and calls the listener when the selected value changes.
   *
   * @param key Key of the selector to observe.
   * @param listener Listener function called when the selector result changes.
   */
  observe(selector, listener) {
    let selectFn;
    if (typeof selector === "function") {
      selectFn = selector;
    } else {
      selectFn = this.selectors[selector];
    }
    let prevValue = selectFn(this.state);
    listener(prevValue, prevValue, this);
    return this.subscribe((nextState) => {
      const nextValue = selectFn(nextState);
      if (!Object.is(prevValue, nextValue)) {
        const oldValue = prevValue;
        prevValue = nextValue;
        listener(nextValue, oldValue, this);
      }
    });
  }
};

// node_modules/@base-ui/react/floating-ui-react/components/FloatingRootStore.mjs
var selectors = {
  open: (state) => state.open,
  transitionStatus: (state) => state.transitionStatus,
  domReferenceElement: (state) => state.domReferenceElement,
  referenceElement: (state) => state.positionReference ?? state.referenceElement,
  floatingElement: (state) => state.floatingElement,
  floatingId: (state) => state.floatingId
};
var FloatingRootStore = class extends ReactStore {
  constructor(options) {
    const {
      syncOnly,
      nested,
      onOpenChange,
      triggerElements,
      ...initialState
    } = options;
    super({
      ...initialState,
      positionReference: initialState.referenceElement,
      domReferenceElement: initialState.referenceElement
    }, {
      onOpenChange,
      dataRef: {
        current: {}
      },
      events: createEventEmitter(),
      nested,
      triggerElements
    }, selectors);
    this.syncOnly = syncOnly;
  }
  /**
   * Syncs the event used by hover logic to distinguish hover-open from click-like interaction.
   */
  syncOpenEvent = (newOpen, event) => {
    if (!newOpen || !this.state.open || // Prevent a pending hover-open from overwriting a click-open event, while allowing
    // click events to upgrade a hover-open.
    event != null && isClickLikeEvent(event)) {
      this.context.dataRef.current.openEvent = newOpen ? event : void 0;
    }
  };
  /**
   * Runs the root-owned side effects for an open state change.
   */
  dispatchOpenChange = (newOpen, eventDetails) => {
    this.syncOpenEvent(newOpen, eventDetails.event);
    const details = {
      open: newOpen,
      reason: eventDetails.reason,
      nativeEvent: eventDetails.event,
      nested: this.context.nested,
      triggerElement: eventDetails.trigger
    };
    this.context.events.emit("openchange", details);
  };
  /**
   * Emits the `openchange` event through the internal event emitter and calls the `onOpenChange` handler with the provided arguments.
   *
   * @param newOpen The new open state.
   * @param eventDetails Details about the event that triggered the open state change.
   */
  setOpen = (newOpen, eventDetails) => {
    if (this.syncOnly) {
      this.context.onOpenChange?.(newOpen, eventDetails);
      return;
    }
    this.dispatchOpenChange(newOpen, eventDetails);
    this.context.onOpenChange?.(newOpen, eventDetails);
  };
};

// node_modules/@base-ui/react/utils/popups/store.mjs
function createInitialPopupStoreState(triggerElements, floatingId, nested = false) {
  return {
    open: false,
    openProp: void 0,
    mounted: false,
    transitionStatus: void 0,
    floatingRootContext: new FloatingRootStore({
      open: false,
      transitionStatus: void 0,
      floatingElement: null,
      referenceElement: null,
      triggerElements,
      floatingId,
      syncOnly: true,
      nested,
      onOpenChange: void 0
    }),
    floatingId,
    triggerCount: 0,
    preventUnmountingOnClose: false,
    payload: void 0,
    activeTriggerId: null,
    activeTriggerElement: null,
    openedWithoutTrigger: false,
    triggerIdProp: void 0,
    popupElement: null,
    positionerElement: null,
    activeTriggerProps: EMPTY_OBJECT,
    inactiveTriggerProps: EMPTY_OBJECT,
    popupProps: EMPTY_OBJECT
  };
}
var activeTriggerIdSelector = (state) => state.triggerIdProp ?? state.activeTriggerId;
var openSelector = (state) => state.openProp ?? state.open;
var popupIdSelector = (state) => {
  const popupId = state.popupElement?.id ?? state.floatingId;
  return popupId || void 0;
};
function triggerOwnsOpenPopup(state, triggerId) {
  return triggerId !== void 0 && openSelector(state) && activeTriggerIdSelector(state) === triggerId;
}
function triggerOwnsOpenPopupOrIsOnlyTrigger(state, triggerId) {
  if (triggerOwnsOpenPopup(state, triggerId)) {
    return true;
  }
  return triggerId !== void 0 && openSelector(state) && activeTriggerIdSelector(state) == null && !state.openedWithoutTrigger && state.triggerCount === 1;
}
var popupStoreSelectors = {
  open: openSelector,
  mounted: (state) => state.mounted,
  // `open` is written synchronously on an open change; `mounted`/`transitionStatus` sync in a
  // layout effect. Match useTransitionStatus so a retained popup does not miss its starting phase.
  transitionStatus: (state) => openSelector(state) && !state.mounted ? "starting" : state.transitionStatus,
  floatingRootContext: (state) => state.floatingRootContext,
  triggerCount: (state) => state.triggerCount,
  preventUnmountingOnClose: (state) => state.preventUnmountingOnClose,
  payload: (state) => state.payload,
  activeTriggerId: activeTriggerIdSelector,
  activeTriggerElement: (state) => state.mounted ? state.activeTriggerElement : null,
  popupId: popupIdSelector,
  /**
   * Whether the trigger with the given ID was used to open the popup.
   */
  isTriggerActive: (state, triggerId) => triggerId !== void 0 && activeTriggerIdSelector(state) === triggerId,
  /**
   * Whether the popup is open and was activated by a trigger with the given ID.
   */
  isOpenedByTrigger: (state, triggerId) => triggerOwnsOpenPopup(state, triggerId),
  /**
   * Whether the popup is mounted and was activated by a trigger with the given ID.
   */
  isMountedByTrigger: (state, triggerId) => triggerId !== void 0 && activeTriggerIdSelector(state) === triggerId && state.mounted,
  triggerProps: (state, isActive) => isActive ? state.activeTriggerProps : state.inactiveTriggerProps,
  /**
   * Popup id for the trigger that currently owns the open popup.
   */
  triggerPopupId: (state, triggerId) => triggerOwnsOpenPopupOrIsOnlyTrigger(state, triggerId) ? popupIdSelector(state) : void 0,
  popupProps: (state) => state.popupProps,
  popupElement: (state) => state.popupElement,
  positionerElement: (state) => state.positionerElement
};

// node_modules/@base-ui/react/utils/popups/usePopupHandleStore.mjs
init_react();
var import_shim2 = __toESM(require_shim(), 1);
function usePopupHandleStore(handle) {
  const subscribe = useCallback((listener) => {
    if (handle === void 0) {
      return NOOP;
    }
    return handle.subscribeStore(listener);
  }, [handle]);
  const getSnapshot = useCallback(() => {
    return handle === void 0 ? void 0 : handle.store;
  }, [handle]);
  return (0, import_shim2.useSyncExternalStore)(subscribe, getSnapshot, () => handle?.serverStore);
}

// node_modules/@base-ui/react/floating-ui-react/hooks/useFocus.mjs
init_react();
var isMacSafari = parts_exports.os.mac && parts_exports.engine.webkit;
function useFocus(store, props = {}) {
  const {
    enabled = true,
    delay
  } = props;
  const {
    events,
    dataRef
  } = store.context;
  const blockFocusRef = useRef(false);
  const blockedReferenceRef = useRef(null);
  const keyboardModalityRef = useRef(true);
  const timeout = useTimeout();
  useEffect(() => {
    const domReference = store.select("domReferenceElement");
    if (!enabled) {
      return void 0;
    }
    const win = getWindow(domReference);
    function onBlur() {
      const currentDomReference = store.select("domReferenceElement");
      if (!store.select("open") && isHTMLElement(currentDomReference) && currentDomReference === activeElement(ownerDocument(currentDomReference))) {
        blockFocusRef.current = true;
        blockedReferenceRef.current = currentDomReference;
      }
    }
    function onKeyDown() {
      keyboardModalityRef.current = true;
    }
    function onPointerDown() {
      keyboardModalityRef.current = false;
    }
    return mergeCleanups(addEventListener(win, "blur", onBlur), isMacSafari && addEventListener(win, "keydown", onKeyDown, true), isMacSafari && addEventListener(win, "pointerdown", onPointerDown, true));
  }, [store, enabled]);
  useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    function onOpenChangeLocal(details) {
      if (details.reason === reason_parts_exports.triggerPress || details.reason === reason_parts_exports.escapeKey) {
        const referenceElement = store.select("domReferenceElement");
        if (isElement(referenceElement)) {
          blockedReferenceRef.current = referenceElement;
          blockFocusRef.current = true;
        }
      }
    }
    events.on("openchange", onOpenChangeLocal);
    return () => {
      events.off("openchange", onOpenChangeLocal);
    };
  }, [events, enabled, store]);
  const reference = useMemo(() => {
    function resetBlockedFocus() {
      blockFocusRef.current = false;
      blockedReferenceRef.current = null;
    }
    return {
      onMouseLeave() {
        resetBlockedFocus();
      },
      onFocus(event) {
        const focusTarget = event.currentTarget;
        if (blockFocusRef.current) {
          if (blockedReferenceRef.current === focusTarget) {
            return;
          }
          resetBlockedFocus();
        }
        const target = getTarget(event.nativeEvent);
        if (isElement(target)) {
          if (isMacSafari && !event.relatedTarget) {
            if (!keyboardModalityRef.current && !isTypeableElement(target)) {
              return;
            }
          } else if (!matchesFocusVisible(target)) {
            return;
          }
        }
        const movedFromOtherEnabledTrigger = isTargetInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements);
        const {
          nativeEvent,
          currentTarget
        } = event;
        if (store.select("open") && movedFromOtherEnabledTrigger || !delay) {
          store.setOpen(true, createChangeEventDetails(reason_parts_exports.triggerFocus, nativeEvent, currentTarget));
          return;
        }
        timeout.start(delay, () => {
          if (blockFocusRef.current) {
            return;
          }
          store.setOpen(true, createChangeEventDetails(reason_parts_exports.triggerFocus, nativeEvent, currentTarget));
        });
      },
      onBlur(event) {
        resetBlockedFocus();
        const relatedTarget = event.relatedTarget;
        const nativeEvent = event.nativeEvent;
        const movedToFocusGuard = isElement(relatedTarget) && relatedTarget.hasAttribute(createAttribute("focus-guard")) && relatedTarget.getAttribute("data-type") === "outside";
        timeout.start(0, () => {
          const domReference = store.select("domReferenceElement");
          const activeEl = activeElement(ownerDocument(domReference));
          if (!relatedTarget && activeEl === domReference) {
            return;
          }
          if (contains(dataRef.current.floatingContext?.refs.floating.current, activeEl) || contains(domReference, activeEl) || movedToFocusGuard) {
            return;
          }
          const nextFocusedElement = relatedTarget ?? activeEl;
          if (isTargetInsideEnabledTrigger(nextFocusedElement, store.context.triggerElements)) {
            return;
          }
          store.setOpen(false, createChangeEventDetails(reason_parts_exports.triggerFocus, nativeEvent));
        });
      }
    };
  }, [dataRef, delay, store, timeout]);
  return useMemo(() => enabled ? {
    reference,
    trigger: reference
  } : {}, [enabled, reference]);
}

// node_modules/@base-ui/react/floating-ui-react/hooks/useHoverFloatingInteraction.mjs
init_react();

// node_modules/@base-ui/react/floating-ui-react/hooks/useHoverInteractionSharedState.mjs
var HoverInteraction = class _HoverInteraction {
  pointerType = void 0;
  interactedInside = false;
  handler = void 0;
  blockMouseMove = true;
  performedPointerEventsMutation = false;
  pointerEventsScopeElement = null;
  pointerEventsReferenceElement = null;
  pointerEventsFloatingElement = null;
  restTimeoutPending = false;
  openChangeTimeout = new Timeout();
  restTimeout = new Timeout();
  handleCloseOptions = void 0;
  static create() {
    return new _HoverInteraction();
  }
  dispose = () => {
    this.openChangeTimeout.clear();
    this.restTimeout.clear();
  };
  disposeEffect = () => {
    return this.dispose;
  };
};
var pointerEventsMutationOwnerByScopeElement = /* @__PURE__ */ new WeakMap();
function clearSafePolygonPointerEventsMutation(instance) {
  if (!instance.performedPointerEventsMutation) {
    return;
  }
  const scopeElement = instance.pointerEventsScopeElement;
  if (scopeElement && pointerEventsMutationOwnerByScopeElement.get(scopeElement) === instance) {
    instance.pointerEventsScopeElement?.style.removeProperty("pointer-events");
    instance.pointerEventsReferenceElement?.style.removeProperty("pointer-events");
    instance.pointerEventsFloatingElement?.style.removeProperty("pointer-events");
    pointerEventsMutationOwnerByScopeElement.delete(scopeElement);
  }
  instance.performedPointerEventsMutation = false;
  instance.pointerEventsScopeElement = null;
  instance.pointerEventsReferenceElement = null;
  instance.pointerEventsFloatingElement = null;
}
function applySafePolygonPointerEventsMutation(instance, options) {
  const {
    scopeElement,
    referenceElement,
    floatingElement
  } = options;
  const existingOwner = pointerEventsMutationOwnerByScopeElement.get(scopeElement);
  if (existingOwner && existingOwner !== instance) {
    clearSafePolygonPointerEventsMutation(existingOwner);
  }
  clearSafePolygonPointerEventsMutation(instance);
  instance.performedPointerEventsMutation = true;
  instance.pointerEventsScopeElement = scopeElement;
  instance.pointerEventsReferenceElement = referenceElement;
  instance.pointerEventsFloatingElement = floatingElement;
  pointerEventsMutationOwnerByScopeElement.set(scopeElement, instance);
  scopeElement.style.pointerEvents = "none";
  referenceElement.style.pointerEvents = "auto";
  floatingElement.style.pointerEvents = "auto";
}
function useHoverInteractionSharedState(store) {
  const data = store.context.dataRef.current;
  const instance = useRefWithInit(() => data.hoverInteractionState ?? HoverInteraction.create()).current;
  if (!data.hoverInteractionState) {
    data.hoverInteractionState = instance;
  }
  useOnMount(data.hoverInteractionState.disposeEffect);
  return data.hoverInteractionState;
}

// node_modules/@base-ui/react/floating-ui-react/hooks/useHoverFloatingInteraction.mjs
function useHoverFloatingInteraction(store, parameters = {}) {
  const {
    enabled = true,
    closeDelay: closeDelayProp = 0,
    nodeId: nodeIdProp
  } = parameters;
  const open2 = store.useState("open");
  const floatingElement = store.useState("floatingElement");
  const domReferenceElement = store.useState("domReferenceElement");
  const {
    dataRef
  } = store.context;
  const tree = useFloatingTree();
  const parentId = useFloatingParentNodeId();
  const instance = useHoverInteractionSharedState(store);
  const childClosedTimeout = useTimeout();
  const isClickLikeOpenEvent2 = useStableCallback(() => {
    return isClickLikeOpenEvent(dataRef.current.openEvent?.type, instance.interactedInside);
  });
  const isHoverOpen = useStableCallback(() => {
    return isHoverOpenEvent(dataRef.current.openEvent?.type);
  });
  const clearPointerEvents = useStableCallback(() => {
    clearSafePolygonPointerEventsMutation(instance);
  });
  useIsoLayoutEffect(() => {
    if (!open2) {
      instance.pointerType = void 0;
      instance.restTimeoutPending = false;
      instance.interactedInside = false;
      clearPointerEvents();
    }
  }, [open2, instance, clearPointerEvents]);
  useEffect(() => {
    return clearPointerEvents;
  }, [clearPointerEvents]);
  useIsoLayoutEffect(() => {
    if (!enabled) {
      return void 0;
    }
    if (open2 && instance.handleCloseOptions?.blockPointerEvents && isHoverOpen() && isElement(domReferenceElement) && floatingElement) {
      const ref = domReferenceElement;
      const floatingEl = floatingElement;
      const doc = ownerDocument(floatingElement);
      const parentFloating = tree?.nodesRef.current.find((node) => node.id === parentId)?.context?.elements.floating;
      if (parentFloating) {
        parentFloating.style.pointerEvents = "";
      }
      const cachedScopeElement = instance.pointerEventsScopeElement !== floatingEl ? instance.pointerEventsScopeElement : null;
      const parentScopeElement = parentFloating !== floatingEl ? parentFloating : null;
      const scopeElement = instance.handleCloseOptions?.getScope?.() ?? cachedScopeElement ?? parentScopeElement ?? closest(ref, "[data-rootownerid]") ?? doc.body;
      applySafePolygonPointerEventsMutation(instance, {
        scopeElement,
        referenceElement: ref,
        floatingElement: floatingEl
      });
      return () => {
        clearPointerEvents();
      };
    }
    return void 0;
  }, [enabled, open2, domReferenceElement, floatingElement, instance, isHoverOpen, tree, parentId, clearPointerEvents]);
  useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    function hasParentChildren() {
      return !!(tree && parentId && getNodeChildren(tree.nodesRef.current, parentId).length > 0);
    }
    function closeWithDelay(event) {
      const closeDelay = getDelay(closeDelayProp, "close", instance.pointerType);
      const close = () => {
        store.setOpen(false, createChangeEventDetails(reason_parts_exports.triggerHover, event));
        tree?.events.emit("floating.closed", event);
      };
      if (closeDelay) {
        instance.openChangeTimeout.start(closeDelay, close);
      } else {
        instance.openChangeTimeout.clear();
        close();
      }
    }
    function handleInteractInside(event) {
      const target = getTarget(event);
      if (!isInteractiveElement(target)) {
        instance.interactedInside = false;
        return;
      }
      instance.interactedInside = closest(target, "[aria-haspopup]") != null;
    }
    function onFloatingMouseEnter() {
      instance.openChangeTimeout.clear();
      childClosedTimeout.clear();
      tree?.events.off("floating.closed", onNodeClosed);
      clearPointerEvents();
    }
    function onFloatingMouseLeave(event) {
      if (hasParentChildren() && tree) {
        tree.events.on("floating.closed", onNodeClosed);
        return;
      }
      if (isTargetInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements)) {
        return;
      }
      const currentNodeId = dataRef.current.floatingContext?.nodeId ?? nodeIdProp;
      const relatedTarget = event.relatedTarget;
      const isMovingIntoDescendantFloating = tree && currentNodeId && isElement(relatedTarget) && getNodeChildren(tree.nodesRef.current, currentNodeId, false).some((node) => contains(node.context?.elements.floating, relatedTarget));
      if (isMovingIntoDescendantFloating) {
        return;
      }
      if (instance.handler) {
        instance.handler(event);
        return;
      }
      clearPointerEvents();
      if (isHoverOpen() && !isClickLikeOpenEvent2()) {
        closeWithDelay(event);
      }
    }
    function onNodeClosed(event) {
      if (!tree || !parentId || hasParentChildren()) {
        return;
      }
      childClosedTimeout.start(0, () => {
        tree.events.off("floating.closed", onNodeClosed);
        store.setOpen(false, createChangeEventDetails(reason_parts_exports.triggerHover, event));
        tree.events.emit("floating.closed", event);
      });
    }
    const floating = floatingElement;
    return mergeCleanups(floating && addEventListener(floating, "mouseenter", onFloatingMouseEnter), floating && addEventListener(floating, "mouseleave", onFloatingMouseLeave), floating && addEventListener(floating, "pointerdown", handleInteractInside, true), () => {
      tree?.events.off("floating.closed", onNodeClosed);
    });
  }, [enabled, floatingElement, store, dataRef, closeDelayProp, nodeIdProp, isHoverOpen, isClickLikeOpenEvent2, clearPointerEvents, instance, tree, parentId, childClosedTimeout]);
}

// node_modules/@base-ui/react/floating-ui-react/hooks/useHoverReferenceInteraction.mjs
init_react();
var EMPTY_REF = {
  current: null
};
function useHoverReferenceInteraction(store, props = {}) {
  const {
    enabled = true,
    delay = 0,
    handleClose = null,
    mouseOnly = false,
    restMs = 0,
    move = true,
    triggerElementRef = EMPTY_REF,
    externalTree,
    isActiveTrigger = true,
    getHandleCloseContext,
    isClosing,
    shouldOpen: shouldOpenProp,
    guardStaleOpen = false
  } = props;
  const {
    dataRef,
    events
  } = store.context;
  const tree = useFloatingTree(externalTree);
  const instance = useHoverInteractionSharedState(store);
  const isHoverCloseActiveRef = useRef(false);
  const handleCloseRef = useValueAsRef(handleClose);
  const delayRef = useValueAsRef(delay);
  const restMsRef = useValueAsRef(restMs);
  const enabledRef = useValueAsRef(enabled);
  const shouldOpenRef = useValueAsRef(shouldOpenProp);
  const isClosingRef = useValueAsRef(isClosing);
  const isClickLikeOpenEvent2 = useStableCallback(() => {
    return isClickLikeOpenEvent(dataRef.current.openEvent?.type, instance.interactedInside);
  });
  const checkShouldOpen = useStableCallback(() => {
    return shouldOpenRef.current?.() !== false;
  });
  const isOverInactiveTrigger = useStableCallback((currentDomReference, currentTarget, target) => {
    const allTriggers = store.context.triggerElements;
    if (allTriggers.hasElement(currentTarget)) {
      return !currentDomReference || !contains(currentDomReference, currentTarget);
    }
    if (!isElement(target)) {
      return false;
    }
    const targetElement = target;
    return allTriggers.hasMatchingElement((trigger) => contains(trigger, targetElement)) && (!currentDomReference || !contains(currentDomReference, targetElement));
  });
  const cleanupMouseMoveHandler = useStableCallback(() => {
    if (!instance.handler) {
      return;
    }
    const doc = ownerDocument(store.select("domReferenceElement"));
    doc.removeEventListener("mousemove", instance.handler);
    instance.handler = void 0;
  });
  const clearPointerEvents = useStableCallback(() => {
    clearSafePolygonPointerEventsMutation(instance);
  });
  if (isActiveTrigger) {
    instance.handleCloseOptions = handleClose?.__options;
  }
  useEffect(() => cleanupMouseMoveHandler, [cleanupMouseMoveHandler]);
  useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    function onOpenChangeLocal(details) {
      if (!details.open) {
        isHoverCloseActiveRef.current = details.reason === reason_parts_exports.triggerHover;
        cleanupMouseMoveHandler();
        instance.openChangeTimeout.clear();
        instance.restTimeout.clear();
        instance.blockMouseMove = true;
        instance.restTimeoutPending = false;
      } else {
        isHoverCloseActiveRef.current = false;
      }
    }
    events.on("openchange", onOpenChangeLocal);
    return () => {
      events.off("openchange", onOpenChangeLocal);
    };
  }, [enabled, events, instance, cleanupMouseMoveHandler]);
  useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    function closeWithDelay(event, runElseBranch = true) {
      const closeDelay = getDelay(delayRef.current, "close", instance.pointerType);
      if (closeDelay) {
        instance.openChangeTimeout.start(closeDelay, () => {
          store.setOpen(false, createChangeEventDetails(reason_parts_exports.triggerHover, event));
          tree?.events.emit("floating.closed", event);
        });
      } else if (runElseBranch) {
        instance.openChangeTimeout.clear();
        store.setOpen(false, createChangeEventDetails(reason_parts_exports.triggerHover, event));
        tree?.events.emit("floating.closed", event);
      }
    }
    const trigger = triggerElementRef.current ?? (isActiveTrigger ? store.select("domReferenceElement") : null);
    if (!isElement(trigger)) {
      return void 0;
    }
    function onMouseEnter(event) {
      instance.openChangeTimeout.clear();
      instance.blockMouseMove = false;
      if (mouseOnly && !isMouseLikePointerType(instance.pointerType)) {
        return;
      }
      const restMsValue = getRestMs(restMsRef.current);
      const openDelay = getDelay(delayRef.current, "open", instance.pointerType);
      const eventTarget = getTarget(event);
      const currentTarget = event.currentTarget ?? null;
      const currentDomReference = store.select("domReferenceElement");
      let triggerNode = currentTarget;
      if (isElement(eventTarget) && !store.context.triggerElements.hasElement(eventTarget)) {
        for (const triggerElement of store.context.triggerElements.elements()) {
          if (contains(triggerElement, eventTarget)) {
            triggerNode = triggerElement;
            break;
          }
        }
      }
      if (isElement(currentTarget) && isElement(currentDomReference) && !store.context.triggerElements.hasElement(currentTarget) && contains(currentTarget, currentDomReference)) {
        triggerNode = currentDomReference;
      }
      const isOverInactive = triggerNode == null ? false : isOverInactiveTrigger(currentDomReference, triggerNode, eventTarget);
      const isOpen = store.select("open");
      const isInClosingTransition = isClosingRef.current?.() ?? store.select("transitionStatus") === "ending";
      const isHoverCloseTransition = !isOpen && isInClosingTransition && isHoverCloseActiveRef.current;
      const isReenteringSameTriggerDuringCloseTransition = !isOverInactive && isElement(triggerNode) && isElement(currentDomReference) && contains(currentDomReference, triggerNode) && isHoverCloseTransition;
      const isRestOnlyDelay = restMsValue > 0 && !openDelay;
      const shouldOpenImmediately = isOverInactive && (isOpen || isHoverCloseTransition) || isReenteringSameTriggerDuringCloseTransition;
      const shouldOpen = !isOpen || isOverInactive;
      if (shouldOpenImmediately) {
        if (checkShouldOpen()) {
          store.setOpen(true, createChangeEventDetails(reason_parts_exports.triggerHover, event, triggerNode));
        }
        return;
      }
      if (isRestOnlyDelay) {
        return;
      }
      if (openDelay) {
        instance.openChangeTimeout.start(openDelay, () => {
          if (shouldOpen && checkShouldOpen()) {
            store.setOpen(true, createChangeEventDetails(reason_parts_exports.triggerHover, event, triggerNode));
          }
        });
      } else if (shouldOpen) {
        if (checkShouldOpen()) {
          store.setOpen(true, createChangeEventDetails(reason_parts_exports.triggerHover, event, triggerNode));
        }
      }
    }
    function onMouseLeave(event) {
      if (isClickLikeOpenEvent2()) {
        clearPointerEvents();
        return;
      }
      cleanupMouseMoveHandler();
      const domReferenceElement = store.select("domReferenceElement");
      const doc = ownerDocument(domReferenceElement);
      instance.restTimeout.clear();
      instance.restTimeoutPending = false;
      const handleCloseContextBase = dataRef.current.floatingContext ?? getHandleCloseContext?.();
      if (isTargetInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements)) {
        return;
      }
      if (handleCloseRef.current && handleCloseContextBase) {
        if (!store.select("open")) {
          instance.openChangeTimeout.clear();
        }
        const currentTrigger = triggerElementRef.current;
        instance.handler = handleCloseRef.current({
          ...handleCloseContextBase,
          tree,
          x: event.clientX,
          y: event.clientY,
          onClose() {
            clearPointerEvents();
            cleanupMouseMoveHandler();
            if (enabledRef.current && !isClickLikeOpenEvent2() && currentTrigger === store.select("domReferenceElement")) {
              closeWithDelay(event, true);
            }
          }
        });
        doc.addEventListener("mousemove", instance.handler);
        instance.handler(event);
        return;
      }
      const shouldClose = instance.pointerType === "touch" ? !contains(store.select("floatingElement"), event.relatedTarget) : true;
      if (shouldClose) {
        closeWithDelay(event);
      }
    }
    function onMouseOut(event) {
      if (contains(trigger, event.relatedTarget)) {
        return;
      }
      instance.openChangeTimeout.clear();
      instance.restTimeout.clear();
      instance.restTimeoutPending = false;
    }
    const staleOpenGuard = guardStaleOpen ? addEventListener(trigger, "mouseout", onMouseOut) : void 0;
    if (move) {
      return mergeCleanups(addEventListener(trigger, "mousemove", onMouseEnter, {
        once: true
      }), addEventListener(trigger, "mouseenter", onMouseEnter), addEventListener(trigger, "mouseleave", onMouseLeave), staleOpenGuard);
    }
    return mergeCleanups(addEventListener(trigger, "mouseenter", onMouseEnter), addEventListener(trigger, "mouseleave", onMouseLeave), staleOpenGuard);
  }, [cleanupMouseMoveHandler, clearPointerEvents, dataRef, delayRef, store, enabled, handleCloseRef, instance, isActiveTrigger, isOverInactiveTrigger, isClickLikeOpenEvent2, mouseOnly, move, restMsRef, triggerElementRef, tree, enabledRef, getHandleCloseContext, isClosingRef, checkShouldOpen, guardStaleOpen]);
  return useMemo(() => {
    if (!enabled) {
      return void 0;
    }
    function setPointerRef(event) {
      instance.pointerType = event.pointerType;
    }
    return {
      onPointerDown: setPointerRef,
      onPointerEnter: setPointerRef,
      onMouseMove(event) {
        const {
          nativeEvent
        } = event;
        const trigger = event.currentTarget;
        const currentDomReference = store.select("domReferenceElement");
        const currentOpen = store.select("open");
        const isOverInactive = isOverInactiveTrigger(currentDomReference, trigger, event.target);
        if (mouseOnly && !isMouseLikePointerType(instance.pointerType)) {
          return;
        }
        if (currentOpen && isOverInactive && instance.handleCloseOptions?.blockPointerEvents) {
          const floatingElement = store.select("floatingElement");
          if (floatingElement) {
            const scopeElement = instance.handleCloseOptions?.getScope?.() ?? trigger.ownerDocument.body;
            applySafePolygonPointerEventsMutation(instance, {
              scopeElement,
              referenceElement: trigger,
              floatingElement
            });
          }
        }
        const restMsValue = getRestMs(restMsRef.current);
        if (currentOpen && !isOverInactive || restMsValue === 0) {
          return;
        }
        if (!isOverInactive && instance.restTimeoutPending && event.movementX ** 2 + event.movementY ** 2 < 2) {
          return;
        }
        instance.restTimeout.clear();
        function handleMouseMove() {
          instance.restTimeoutPending = false;
          if (isClickLikeOpenEvent2()) {
            return;
          }
          const latestOpen = store.select("open");
          if (!instance.blockMouseMove && (!latestOpen || isOverInactive) && checkShouldOpen()) {
            store.setOpen(true, createChangeEventDetails(reason_parts_exports.triggerHover, nativeEvent, trigger));
          }
        }
        if (instance.pointerType === "touch") {
          flushSync(() => {
            handleMouseMove();
          });
        } else if (isOverInactive && currentOpen) {
          handleMouseMove();
        } else {
          instance.restTimeoutPending = true;
          instance.restTimeout.start(restMsValue, handleMouseMove);
        }
      }
    };
  }, [enabled, instance, isClickLikeOpenEvent2, isOverInactiveTrigger, mouseOnly, store, restMsRef, checkShouldOpen]);
}

// node_modules/@base-ui/react/floating-ui-react/hooks/useListNavigation.mjs
init_react();
function isStationaryWebKitPointer(event) {
  return parts_exports.engine.webkit && event.movementX === 0 && event.movementY === 0;
}
function doSwitch(orientation, vertical, horizontal) {
  switch (orientation) {
    case "vertical":
      return vertical;
    case "horizontal":
      return horizontal;
    default:
      return vertical || horizontal;
  }
}
function isMainOrientationKey(key, orientation) {
  const vertical = key === ARROW_UP || key === ARROW_DOWN;
  const horizontal = key === ARROW_LEFT || key === ARROW_RIGHT;
  return doSwitch(orientation, vertical, horizontal);
}
function isMainOrientationToEndKey(key, orientation, rtl) {
  const vertical = key === ARROW_DOWN;
  const horizontal = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  return doSwitch(orientation, vertical, horizontal) || key === "Enter" || key === " " || key === "";
}
function isCrossOrientationOpenKey(key, orientation, rtl) {
  const vertical = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  const horizontal = key === ARROW_DOWN;
  return doSwitch(orientation, vertical, horizontal);
}
function isCrossOrientationCloseKey(key, orientation, rtl, grid) {
  const vertical = rtl ? key === ARROW_RIGHT : key === ARROW_LEFT;
  const horizontal = key === ARROW_UP;
  if (orientation === "both" || orientation === "horizontal" && grid) {
    return key === "Escape";
  }
  return doSwitch(orientation, vertical, horizontal);
}
function useListNavigation(store, props) {
  const {
    listRef,
    activeIndex,
    onNavigate: onNavigateProp = () => {
    },
    enabled = true,
    selectedIndex = null,
    allowEscape = false,
    loopFocus = false,
    nested = false,
    rtl = false,
    virtual = false,
    focusItemOnOpen = "auto",
    focusItemOnHover = true,
    openOnArrowKeyDown = true,
    disabledIndices = void 0,
    orientation = "vertical",
    triggerOrientation = orientation,
    parentOrientation,
    id,
    resetOnPointerLeave = true,
    externalTree,
    nestedReturnFocusRef,
    grid: navigateGrid
  } = props;
  const isGrid = navigateGrid != null;
  if (false) {
    if (allowEscape) {
      if (!loopFocus) {
        console.warn("`useListNavigation` looping must be enabled to allow escaping.");
      }
      if (!virtual) {
        console.warn("`useListNavigation` must be virtual to allow escaping.");
      }
    }
    if (orientation === "vertical" && isGrid) {
      console.warn("In grid list navigation mode, the `orientation` should", 'be either "horizontal" or "both".');
    }
  }
  const open2 = store.useState("open");
  const floatingElement = store.useState("floatingElement");
  const domReferenceElement = store.useState("domReferenceElement");
  const dataRef = store.context.dataRef;
  const floatingFocusElement = getFloatingFocusElement(floatingElement);
  const typeableComboboxReference = isTypeableCombobox(domReferenceElement);
  const floatingFocusElementRef = useValueAsRef(floatingFocusElement);
  const parentId = useFloatingParentNodeId();
  const tree = useFloatingTree(externalTree);
  const focusItemOnOpenRef = useRef(focusItemOnOpen);
  const indexRef = useRef(selectedIndex ?? -1);
  const keyRef = useRef(null);
  const isPointerModalityRef = useRef(true);
  const onNavigate = useStableCallback((event) => {
    onNavigateProp(indexRef.current === -1 ? null : indexRef.current, event);
  });
  const previousMountedRef = useRef(!!floatingElement);
  const previousOpenRef = useRef(open2);
  const forceSyncFocusRef = useRef(false);
  const forceScrollIntoViewRef = useRef(false);
  const cancelQueuedFocusRef = useRef(null);
  const disabledIndicesRef = useValueAsRef(disabledIndices);
  const latestOpenRef = useValueAsRef(open2);
  const selectedIndexRef = useValueAsRef(selectedIndex);
  const resetOnPointerLeaveRef = useValueAsRef(resetOnPointerLeave);
  const focusFrame = useAnimationFrame();
  const waitForListPopulatedFrame = useAnimationFrame();
  const focusItem = useStableCallback(() => {
    focusFrame.cancel();
    function runFocus(item2) {
      if (!virtual) {
        cancelQueuedFocusRef.current = enqueueFocus(item2, {
          sync: forceSyncFocusRef.current,
          preventScroll: true
        });
      }
    }
    const initialItem = listRef.current[indexRef.current];
    const forceScrollIntoView = forceScrollIntoViewRef.current;
    if (initialItem) {
      runFocus(initialItem);
    }
    const scheduler2 = forceSyncFocusRef.current ? (callback) => callback() : (callback) => focusFrame.request(callback);
    scheduler2(() => {
      const waitedItem = listRef.current[indexRef.current] || initialItem;
      if (!waitedItem) {
        return;
      }
      if (!initialItem) {
        runFocus(waitedItem);
      }
      const shouldScrollIntoView = (
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        item && (forceScrollIntoView || !isPointerModalityRef.current)
      );
      if (shouldScrollIntoView) {
        waitedItem.scrollIntoView?.({
          block: "nearest",
          inline: "nearest"
        });
      }
    });
  });
  useIsoLayoutEffect(() => {
    dataRef.current.orientation = orientation;
  }, [dataRef, orientation]);
  useIsoLayoutEffect(() => {
    if (!open2) {
      keyRef.current = null;
    }
    if (!open2 || focusItemOnOpen !== "auto") {
      focusItemOnOpenRef.current = focusItemOnOpen;
    }
  }, [open2, focusItemOnOpen]);
  useIsoLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    if (open2 && floatingElement) {
      indexRef.current = selectedIndex ?? -1;
      if (focusItemOnOpenRef.current && selectedIndex != null) {
        forceScrollIntoViewRef.current = true;
        onNavigate();
      }
    } else if (previousMountedRef.current) {
      indexRef.current = -1;
      onNavigate();
    }
  }, [enabled, open2, floatingElement, selectedIndex, onNavigate]);
  useIsoLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    if (!open2) {
      forceSyncFocusRef.current = false;
      return;
    }
    if (!floatingElement) {
      return;
    }
    if (activeIndex == null) {
      forceSyncFocusRef.current = false;
      if (selectedIndexRef.current != null) {
        return;
      }
      if (previousMountedRef.current) {
        indexRef.current = -1;
        focusItem();
      }
      if ((!previousOpenRef.current || !previousMountedRef.current) && focusItemOnOpenRef.current && (keyRef.current != null || focusItemOnOpenRef.current === true && keyRef.current == null)) {
        let runs = 0;
        const waitForListPopulated = () => {
          if (listRef.current[0] == null) {
            if (runs < 2) {
              const scheduler2 = runs ? (callback) => waitForListPopulatedFrame.request(callback) : queueMicrotask;
              scheduler2(waitForListPopulated);
            }
            runs += 1;
          } else {
            indexRef.current = keyRef.current == null || isMainOrientationToEndKey(keyRef.current, triggerOrientation, rtl) || nested ? getMinListIndex(listRef) : getMaxListIndex(listRef);
            keyRef.current = null;
            onNavigate();
          }
        };
        waitForListPopulated();
      }
    } else if (!isIndexOutOfListBounds(listRef.current, activeIndex)) {
      indexRef.current = activeIndex;
      focusItem();
      forceScrollIntoViewRef.current = false;
    }
  }, [enabled, open2, floatingElement, activeIndex, selectedIndexRef, nested, listRef, triggerOrientation, rtl, onNavigate, focusItem, waitForListPopulatedFrame]);
  useIsoLayoutEffect(() => {
    if (!enabled || floatingElement || !tree || virtual || !previousMountedRef.current) {
      return;
    }
    const nodes = tree.nodesRef.current;
    const parent = nodes.find((node) => node.id === parentId)?.context?.elements.floating;
    const activeEl = activeElement(ownerDocument(domReferenceElement ?? parent ?? null));
    const treeContainsActiveEl = nodes.some((node) => node.context && contains(node.context.elements.floating, activeEl));
    if (parent && !treeContainsActiveEl && isPointerModalityRef.current) {
      parent.focus({
        preventScroll: true
      });
    }
  }, [enabled, floatingElement, domReferenceElement, tree, parentId, virtual]);
  useIsoLayoutEffect(() => {
    previousOpenRef.current = open2;
    previousMountedRef.current = !!floatingElement;
  });
  const hasActiveIndex = activeIndex != null;
  const syncCurrentTarget = useStableCallback((event) => {
    if (!latestOpenRef.current) {
      return;
    }
    const index2 = listRef.current.indexOf(event.currentTarget);
    if (index2 !== -1 && (indexRef.current !== index2 || activeIndex !== index2)) {
      indexRef.current = index2;
      onNavigate(event);
    }
  });
  const getParentOrientation = useStableCallback(() => {
    return parentOrientation ?? tree?.nodesRef.current.find((node) => node.id === parentId)?.context?.dataRef?.current.orientation;
  });
  const getMinEnabledIndex = useStableCallback(() => {
    return getMinListIndex(listRef, disabledIndicesRef.current);
  });
  const commonOnKeyDown = useStableCallback((event) => {
    isPointerModalityRef.current = false;
    forceSyncFocusRef.current = true;
    if (event.which === 229) {
      return;
    }
    if (!latestOpenRef.current && event.currentTarget === floatingFocusElementRef.current) {
      return;
    }
    if (nested && isCrossOrientationCloseKey(event.key, orientation, rtl, isGrid)) {
      if (!isMainOrientationKey(event.key, getParentOrientation())) {
        stopEvent(event);
      }
      store.setOpen(false, createChangeEventDetails(reason_parts_exports.listNavigation, event.nativeEvent));
      const returnElement = nestedReturnFocusRef?.current ?? domReferenceElement;
      if (isHTMLElement(returnElement)) {
        returnElement.focus();
      }
      return;
    }
    if (activeIndex != null && activeIndex !== indexRef.current && !isIndexOutOfListBounds(listRef.current, activeIndex)) {
      indexRef.current = activeIndex;
    }
    const currentIndex = indexRef.current;
    const minIndex = getMinListIndex(listRef, disabledIndices);
    const maxIndex = getMaxListIndex(listRef, disabledIndices);
    if (!typeableComboboxReference) {
      if (event.key === "Home") {
        stopEvent(event);
        indexRef.current = minIndex;
        onNavigate(event);
      }
      if (event.key === "End") {
        stopEvent(event);
        indexRef.current = maxIndex;
        onNavigate(event);
      }
    }
    if (navigateGrid != null) {
      const index2 = navigateGrid(event, indexRef.current, listRef, orientation, loopFocus, rtl, disabledIndices, minIndex, maxIndex);
      if (index2 != null && index2 !== indexRef.current) {
        indexRef.current = index2;
        onNavigate(event);
      }
      if (orientation === "both") {
        return;
      }
    }
    if (isMainOrientationKey(event.key, orientation)) {
      stopEvent(event);
      const focusedElement = activeElement(event.currentTarget.ownerDocument);
      if (open2 && !virtual && contains(event.currentTarget, focusedElement) && !listRef.current.some((item2) => item2 != null && contains(item2, focusedElement))) {
        indexRef.current = isMainOrientationToEndKey(event.key, orientation, rtl) ? minIndex : maxIndex;
        onNavigate(event);
        if (activeIndex === indexRef.current) {
          focusItem();
        }
        return;
      }
      const {
        index: index2,
        wrapped
      } = getNextListIndex(listRef.current, currentIndex, {
        decrement: !isMainOrientationToEndKey(event.key, orientation, rtl),
        loopFocus,
        allowEscape,
        disabledIndices,
        minIndex,
        maxIndex
      });
      if (wrapped) {
        forceSyncFocusRef.current = false;
      }
      indexRef.current = index2;
      onNavigate(event);
    }
  });
  const item = useMemo(() => {
    const itemProps = {
      onFocus(event) {
        forceSyncFocusRef.current = true;
        syncCurrentTarget(event);
      },
      onClick({
        currentTarget
      }) {
        if (!virtual) {
          currentTarget.focus({
            preventScroll: true
          });
        }
      },
      onMouseMove(event) {
        if (isStationaryWebKitPointer(event)) {
          return;
        }
        forceSyncFocusRef.current = true;
        forceScrollIntoViewRef.current = false;
        if (focusItemOnHover) {
          syncCurrentTarget(event);
        }
      },
      onPointerLeave(event) {
        if (!latestOpenRef.current || !isPointerModalityRef.current || event.pointerType === "touch") {
          return;
        }
        forceSyncFocusRef.current = true;
        const relatedTarget = event.relatedTarget;
        if (!focusItemOnHover || listRef.current.includes(relatedTarget)) {
          return;
        }
        if (!resetOnPointerLeaveRef.current) {
          return;
        }
        cancelQueuedFocusRef.current?.();
        cancelQueuedFocusRef.current = null;
        indexRef.current = -1;
        onNavigate(event);
        if (!virtual) {
          const floatingFocusEl = floatingFocusElementRef.current;
          const activeEl = activeElement(ownerDocument(floatingFocusEl));
          if (floatingFocusEl && contains(floatingFocusEl, activeEl)) {
            floatingFocusEl.focus({
              preventScroll: true
            });
          }
        }
      }
    };
    return itemProps;
  }, [syncCurrentTarget, latestOpenRef, floatingFocusElementRef, focusItemOnHover, listRef, onNavigate, resetOnPointerLeaveRef, virtual]);
  const ariaActiveDescendantProp = useMemo(() => {
    return virtual && open2 && hasActiveIndex && {
      "aria-activedescendant": `${id}-${activeIndex}`
    };
  }, [virtual, open2, hasActiveIndex, id, activeIndex]);
  const floating = useMemo(() => {
    return {
      ...!typeableComboboxReference ? ariaActiveDescendantProp : {},
      onKeyDown(event) {
        if (event.key === "Tab" && event.shiftKey && open2 && !virtual) {
          const target = getTarget(event.nativeEvent);
          if (target && !contains(floatingFocusElementRef.current, target)) {
            return;
          }
          stopEvent(event);
          const details = createChangeEventDetails(reason_parts_exports.focusOut, event.nativeEvent);
          store.setOpen(false, details);
          const returnElement = nestedReturnFocusRef?.current ?? domReferenceElement;
          if (!details.isCanceled && isHTMLElement(returnElement)) {
            returnElement.focus();
          }
          return;
        }
        commonOnKeyDown(event);
      },
      onPointerMove(event) {
        if (isStationaryWebKitPointer(event)) {
          return;
        }
        isPointerModalityRef.current = true;
      }
    };
  }, [ariaActiveDescendantProp, commonOnKeyDown, floatingFocusElementRef, typeableComboboxReference, store, open2, virtual, domReferenceElement, nestedReturnFocusRef]);
  const trigger = useMemo(() => {
    function openOnNavigationKeyDown(event) {
      store.setOpen(true, createChangeEventDetails(reason_parts_exports.listNavigation, event.nativeEvent, event.currentTarget));
    }
    function checkVirtualMouse(event) {
      if (focusItemOnOpen === "auto" && isVirtualClick(event.nativeEvent)) {
        focusItemOnOpenRef.current = !virtual;
      }
    }
    function checkVirtualPointer(event) {
      focusItemOnOpenRef.current = focusItemOnOpen;
      if (focusItemOnOpen === "auto" && isVirtualPointerEvent(event.nativeEvent)) {
        focusItemOnOpenRef.current = true;
      }
    }
    return {
      onKeyDown(event) {
        const currentOpen = store.select("open");
        isPointerModalityRef.current = false;
        const isArrowKey = event.key.startsWith("Arrow");
        const isParentCrossOpenKey = isCrossOrientationOpenKey(event.key, getParentOrientation(), rtl);
        const isMainKey = isMainOrientationKey(event.key, currentOpen ? orientation : triggerOrientation);
        const isNavigationKey = (nested ? isParentCrossOpenKey : isMainKey) || event.key === "Enter" || event.key.trim() === "";
        if (virtual && currentOpen && (!nested || isTypeableElement(event.currentTarget))) {
          return commonOnKeyDown(event);
        }
        if (!currentOpen && !openOnArrowKeyDown && isArrowKey) {
          return void 0;
        }
        if (isNavigationKey) {
          const isParentMainKey = isMainOrientationKey(event.key, getParentOrientation());
          keyRef.current = nested && isParentMainKey ? null : event.key;
        }
        if (nested) {
          if (isParentCrossOpenKey) {
            stopEvent(event);
            if (currentOpen) {
              indexRef.current = getMinEnabledIndex();
              onNavigate(event);
              if (virtual) {
                floatingFocusElementRef.current?.focus();
              }
            } else {
              openOnNavigationKeyDown(event);
            }
          }
          return void 0;
        }
        if (isMainKey) {
          if (selectedIndexRef.current != null) {
            indexRef.current = selectedIndexRef.current;
          }
          stopEvent(event);
          if (!currentOpen && openOnArrowKeyDown) {
            openOnNavigationKeyDown(event);
          } else {
            commonOnKeyDown(event);
          }
          if (currentOpen) {
            onNavigate(event);
          }
        }
        return void 0;
      },
      onFocus(event) {
        if (event.target !== event.currentTarget) {
          return;
        }
        if (store.select("open") && !virtual) {
          indexRef.current = -1;
          onNavigate(event);
        }
      },
      onPointerDown: checkVirtualPointer,
      onPointerEnter: checkVirtualPointer,
      onMouseDown: checkVirtualMouse,
      onClick: checkVirtualMouse
    };
  }, [commonOnKeyDown, focusItemOnOpen, getMinEnabledIndex, nested, onNavigate, store, openOnArrowKeyDown, orientation, triggerOrientation, getParentOrientation, rtl, selectedIndexRef, virtual, floatingFocusElementRef]);
  const reference = useMemo(() => {
    return {
      ...ariaActiveDescendantProp,
      ...trigger
    };
  }, [ariaActiveDescendantProp, trigger]);
  return useMemo(() => enabled ? {
    reference,
    floating,
    item,
    trigger
  } : {}, [enabled, reference, floating, trigger, item]);
}

// node_modules/@base-ui/react/floating-ui-react/hooks/useTypeahead.mjs
init_react();
function useTypeahead(store, props) {
  const {
    listRef,
    elementsRef,
    activeIndex,
    onMatch: onMatchProp,
    disabledIndices,
    onTyping: onTypingProp,
    enabled = true,
    resetMs = 750,
    selectedIndex = null
  } = props;
  const onTyping = useStableCallback(onTypingProp);
  const open2 = store.useState("open");
  const timeout = useTimeout();
  const stringRef = useRef("");
  const prevIndexRef = useRef(selectedIndex ?? activeIndex ?? -1);
  const matchIndexRef = useRef(null);
  const onKeyDown = useStableCallback((event) => {
    function getElement(index3) {
      return elementsRef?.current[index3];
    }
    function isItemAvailable(index3) {
      const element = getElement(index3);
      if (element && !isElementVisible(element) || element?.matches(":disabled")) {
        return false;
      }
      return disabledIndices == null || !isListIndexDisabled(EMPTY_ARRAY, index3, disabledIndices);
    }
    function getMatchingIndex(list, string, startIndex2 = 0) {
      if (list.length === 0) {
        return -1;
      }
      const normalizedStartIndex = (startIndex2 % list.length + list.length) % list.length;
      const lowerString = string.toLowerCase();
      for (let offset4 = 0; offset4 < list.length; offset4 += 1) {
        const index3 = (normalizedStartIndex + offset4) % list.length;
        const text = list[index3];
        if (!text?.toLowerCase().startsWith(lowerString) || !isItemAvailable(index3)) {
          continue;
        }
        return index3;
      }
      return -1;
    }
    const listContent = listRef.current;
    if (stringRef.current.length > 0 && event.key === " ") {
      stopEvent(event);
      onTyping?.(true);
    }
    if (stringRef.current.length > 0 && stringRef.current[0] !== " ") {
      if (getMatchingIndex(listContent, stringRef.current) === -1 && event.key !== " ") {
        onTyping?.(false);
      }
    }
    if (listContent == null || // Character key.
    event.key.length !== 1 || // Modifier key.
    event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (open2 && event.key !== " ") {
      stopEvent(event);
      onTyping?.(true);
    }
    const isNewSession = stringRef.current === "";
    if (isNewSession) {
      prevIndexRef.current = selectedIndex ?? activeIndex ?? -1;
    }
    const allowRapidSuccessionOfFirstLetter = listContent.every((text, index3) => text && isItemAvailable(index3) ? text[0]?.toLowerCase() !== text[1]?.toLowerCase() : true);
    if (allowRapidSuccessionOfFirstLetter && stringRef.current === event.key) {
      stringRef.current = "";
      prevIndexRef.current = matchIndexRef.current;
    }
    stringRef.current += event.key;
    timeout.start(resetMs, () => {
      stringRef.current = "";
      prevIndexRef.current = matchIndexRef.current;
      onTyping?.(false);
    });
    const prevIndex = isNewSession ? selectedIndex ?? activeIndex ?? -1 : prevIndexRef.current;
    const startIndex = (prevIndex ?? 0) + 1;
    const index2 = getMatchingIndex(listContent, stringRef.current, startIndex);
    if (index2 !== -1) {
      onMatchProp?.(index2, event);
      matchIndexRef.current = index2;
    } else if (event.key !== " ") {
      stringRef.current = "";
      onTyping?.(false);
    }
  });
  const onBlur = useStableCallback((event) => {
    const next = event.relatedTarget;
    const currentDomReferenceElement = store.select("domReferenceElement");
    const currentFloatingElement = store.select("floatingElement");
    const withinComposite = contains(currentDomReferenceElement, next) || contains(currentFloatingElement, next);
    if (withinComposite) {
      return;
    }
    timeout.clear();
    stringRef.current = "";
    prevIndexRef.current = matchIndexRef.current;
    onTyping?.(false);
  });
  useIsoLayoutEffect(() => {
    if (!open2 && selectedIndex !== null) {
      return;
    }
    timeout.clear();
    matchIndexRef.current = null;
    if (stringRef.current !== "") {
      stringRef.current = "";
      onTyping?.(false);
    }
  }, [open2, selectedIndex, timeout, onTyping]);
  const sharedProps = useMemo(() => ({
    onKeyDown,
    onBlur
  }), [onKeyDown, onBlur]);
  return useMemo(() => enabled ? {
    reference: sharedProps,
    floating: sharedProps
  } : {}, [enabled, sharedProps]);
}

// node_modules/@base-ui/react/floating-ui-react/safePolygon.mjs
var CURSOR_SPEED_THRESHOLD = 0.1;
var CURSOR_SPEED_THRESHOLD_SQUARED = CURSOR_SPEED_THRESHOLD * CURSOR_SPEED_THRESHOLD;
var POLYGON_BUFFER = 0.5;
function hasIntersectingEdge(pointX, pointY, xi, yi, xj, yj) {
  return yi >= pointY !== yj >= pointY && pointX <= (xj - xi) * (pointY - yi) / (yj - yi) + xi;
}
function isPointInQuadrilateral(pointX, pointY, x1, y1, x2, y2, x3, y3, x4, y4) {
  let isInsideValue = false;
  if (hasIntersectingEdge(pointX, pointY, x1, y1, x2, y2)) {
    isInsideValue = !isInsideValue;
  }
  if (hasIntersectingEdge(pointX, pointY, x2, y2, x3, y3)) {
    isInsideValue = !isInsideValue;
  }
  if (hasIntersectingEdge(pointX, pointY, x3, y3, x4, y4)) {
    isInsideValue = !isInsideValue;
  }
  if (hasIntersectingEdge(pointX, pointY, x4, y4, x1, y1)) {
    isInsideValue = !isInsideValue;
  }
  return isInsideValue;
}
function isInsideRect(pointX, pointY, rect) {
  return pointX >= rect.x && pointX <= rect.x + rect.width && pointY >= rect.y && pointY <= rect.y + rect.height;
}
function isInsideAxisAlignedRect(pointX, pointY, x1, y1, x2, y2) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return pointX >= minX && pointX <= maxX && pointY >= minY && pointY <= maxY;
}
function safePolygon(options = {}) {
  const {
    blockPointerEvents = false
  } = options;
  const timeout = new Timeout();
  const fn = ({
    x,
    y,
    placement,
    elements,
    onClose,
    nodeId,
    tree
  }) => {
    const side = placement?.split("-")[0];
    let hasLanded = false;
    let lastX = null;
    let lastY = null;
    let lastCursorTime = typeof performance !== "undefined" ? performance.now() : 0;
    function isCursorMovingSlowly(nextX, nextY) {
      const currentTime = performance.now();
      const elapsedTime = currentTime - lastCursorTime;
      if (lastX === null || lastY === null || elapsedTime === 0) {
        lastX = nextX;
        lastY = nextY;
        lastCursorTime = currentTime;
        return false;
      }
      const deltaX = nextX - lastX;
      const deltaY = nextY - lastY;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      const thresholdSquared = elapsedTime * elapsedTime * CURSOR_SPEED_THRESHOLD_SQUARED;
      lastX = nextX;
      lastY = nextY;
      lastCursorTime = currentTime;
      return distanceSquared < thresholdSquared;
    }
    function close() {
      timeout.clear();
      onClose();
    }
    return function onMouseMove(event) {
      timeout.clear();
      const domReference = elements.domReference;
      const floating = elements.floating;
      if (!domReference || !floating || side == null || x == null || y == null) {
        return void 0;
      }
      const {
        clientX,
        clientY
      } = event;
      const target = getTarget(event);
      const isLeave = event.type === "mouseleave";
      const isOverFloatingEl = contains(floating, target);
      const isOverReferenceEl = contains(domReference, target);
      if (isOverFloatingEl) {
        hasLanded = true;
        if (!isLeave) {
          return void 0;
        }
      }
      if (isOverReferenceEl) {
        hasLanded = false;
        if (!isLeave) {
          hasLanded = true;
          return void 0;
        }
      }
      if (isLeave && isElement(event.relatedTarget) && contains(floating, event.relatedTarget)) {
        return void 0;
      }
      function hasOpenChildNode() {
        return Boolean(tree && getNodeChildren(tree.nodesRef.current, nodeId).length > 0);
      }
      function closeIfNoOpenChild() {
        if (!hasOpenChildNode()) {
          close();
        }
      }
      if (hasOpenChildNode()) {
        return void 0;
      }
      const refRect = domReference.getBoundingClientRect();
      const rect = floating.getBoundingClientRect();
      const cursorLeaveFromRight = x > rect.right - rect.width / 2;
      const cursorLeaveFromBottom = y > rect.bottom - rect.height / 2;
      const isFloatingWider = rect.width > refRect.width;
      const isFloatingTaller = rect.height > refRect.height;
      const left = (isFloatingWider ? refRect : rect).left;
      const right = (isFloatingWider ? refRect : rect).right;
      const top = (isFloatingTaller ? refRect : rect).top;
      const bottom = (isFloatingTaller ? refRect : rect).bottom;
      if (side === "top" && y >= refRect.bottom - 1 || side === "bottom" && y <= refRect.top + 1 || side === "left" && x >= refRect.right - 1 || side === "right" && x <= refRect.left + 1) {
        closeIfNoOpenChild();
        return void 0;
      }
      let isInsideTroughRect = false;
      switch (side) {
        case "top":
          isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, left, refRect.top + 1, right, rect.bottom - 1);
          break;
        case "bottom":
          isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, left, rect.top + 1, right, refRect.bottom - 1);
          break;
        case "left":
          isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, rect.right - 1, bottom, refRect.left + 1, top);
          break;
        case "right":
          isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, refRect.right - 1, bottom, rect.left + 1, top);
          break;
        default:
      }
      if (isInsideTroughRect) {
        return void 0;
      }
      if (hasLanded && !isInsideRect(clientX, clientY, refRect)) {
        closeIfNoOpenChild();
        return void 0;
      }
      if (!isLeave && isCursorMovingSlowly(clientX, clientY)) {
        closeIfNoOpenChild();
        return void 0;
      }
      let isInsidePolygon = false;
      switch (side) {
        case "top": {
          const cursorXOffset = isFloatingWider ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
          const cursorPointOneX = isFloatingWider ? x + cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
          const cursorPointTwoX = isFloatingWider ? x - cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
          const cursorPointY = y + POLYGON_BUFFER + 1;
          const commonYLeft = cursorLeaveFromRight ? rect.bottom - POLYGON_BUFFER : isFloatingWider ? rect.bottom - POLYGON_BUFFER : rect.top;
          const commonYRight = cursorLeaveFromRight ? isFloatingWider ? rect.bottom - POLYGON_BUFFER : rect.top : rect.bottom - POLYGON_BUFFER;
          isInsidePolygon = isPointInQuadrilateral(clientX, clientY, cursorPointOneX, cursorPointY, cursorPointTwoX, cursorPointY, rect.left, commonYLeft, rect.right, commonYRight);
          break;
        }
        case "bottom": {
          const cursorXOffset = isFloatingWider ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
          const cursorPointOneX = isFloatingWider ? x + cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
          const cursorPointTwoX = isFloatingWider ? x - cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
          const cursorPointY = y - POLYGON_BUFFER;
          const commonYLeft = cursorLeaveFromRight ? rect.top + POLYGON_BUFFER : isFloatingWider ? rect.top + POLYGON_BUFFER : rect.bottom;
          const commonYRight = cursorLeaveFromRight ? isFloatingWider ? rect.top + POLYGON_BUFFER : rect.bottom : rect.top + POLYGON_BUFFER;
          isInsidePolygon = isPointInQuadrilateral(clientX, clientY, cursorPointOneX, cursorPointY, cursorPointTwoX, cursorPointY, rect.left, commonYLeft, rect.right, commonYRight);
          break;
        }
        case "left": {
          const cursorYOffset = isFloatingTaller ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
          const cursorPointOneY = isFloatingTaller ? y + cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
          const cursorPointTwoY = isFloatingTaller ? y - cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
          const cursorPointX = x + POLYGON_BUFFER + 1;
          const commonXTop = cursorLeaveFromBottom ? rect.right - POLYGON_BUFFER : isFloatingTaller ? rect.right - POLYGON_BUFFER : rect.left;
          const commonXBottom = cursorLeaveFromBottom ? isFloatingTaller ? rect.right - POLYGON_BUFFER : rect.left : rect.right - POLYGON_BUFFER;
          isInsidePolygon = isPointInQuadrilateral(clientX, clientY, commonXTop, rect.top, commonXBottom, rect.bottom, cursorPointX, cursorPointOneY, cursorPointX, cursorPointTwoY);
          break;
        }
        case "right": {
          const cursorYOffset = isFloatingTaller ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
          const cursorPointOneY = isFloatingTaller ? y + cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
          const cursorPointTwoY = isFloatingTaller ? y - cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
          const cursorPointX = x - POLYGON_BUFFER;
          const commonXTop = cursorLeaveFromBottom ? rect.left + POLYGON_BUFFER : isFloatingTaller ? rect.left + POLYGON_BUFFER : rect.right;
          const commonXBottom = cursorLeaveFromBottom ? isFloatingTaller ? rect.left + POLYGON_BUFFER : rect.right : rect.left + POLYGON_BUFFER;
          isInsidePolygon = isPointInQuadrilateral(clientX, clientY, cursorPointX, cursorPointOneY, cursorPointX, cursorPointTwoY, commonXTop, rect.top, commonXBottom, rect.bottom);
          break;
        }
        default:
      }
      if (!isInsidePolygon) {
        closeIfNoOpenChild();
      } else if (!hasLanded) {
        timeout.start(40, closeIfNoOpenChild);
      }
      return void 0;
    };
  };
  fn.__options = {
    ...options,
    blockPointerEvents
  };
  return fn;
}

// node_modules/@floating-ui/core/dist/floating-ui.core.mjs
function computeCoordsFromPlacement(_ref, placement, rtl) {
  let {
    reference,
    floating
  } = _ref;
  const sideAxis = getSideAxis(placement);
  const alignmentAxis = getAlignmentAxis(placement);
  const alignLength = getAxisLength(alignmentAxis);
  const side = getSide(placement);
  const isVertical = sideAxis === "y";
  const commonX = reference.x + reference.width / 2 - floating.width / 2;
  const commonY = reference.y + reference.height / 2 - floating.height / 2;
  const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
  let coords;
  switch (side) {
    case "top":
      coords = {
        x: commonX,
        y: reference.y - floating.height
      };
      break;
    case "bottom":
      coords = {
        x: commonX,
        y: reference.y + reference.height
      };
      break;
    case "right":
      coords = {
        x: reference.x + reference.width,
        y: commonY
      };
      break;
    case "left":
      coords = {
        x: reference.x - floating.width,
        y: commonY
      };
      break;
    default:
      coords = {
        x: reference.x,
        y: reference.y
      };
  }
  const alignment = getAlignment(placement);
  if (alignment) {
    coords[alignmentAxis] += commonAlign * (alignment === "end" ? 1 : -1) * (rtl && isVertical ? -1 : 1);
  }
  return coords;
}
async function detectOverflow(state, options) {
  var _await$platform$isEle;
  if (options === void 0) {
    options = {};
  }
  const {
    x,
    y,
    platform: platform3,
    rects,
    elements,
    strategy
  } = state;
  const {
    boundary = "clippingAncestors",
    rootBoundary = "viewport",
    elementContext = "floating",
    altBoundary = false,
    padding = 0
  } = evaluate(options, state);
  const paddingObject = getPaddingObject(padding);
  const altContext = elementContext === "floating" ? "reference" : "floating";
  const element = elements[altBoundary ? altContext : elementContext];
  const clippingClientRect = rectToClientRect(await platform3.getClippingRect({
    element: ((_await$platform$isEle = await (platform3.isElement == null ? void 0 : platform3.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || await (platform3.getDocumentElement == null ? void 0 : platform3.getDocumentElement(elements.floating)),
    boundary,
    rootBoundary,
    strategy
  }));
  const rect = elementContext === "floating" ? {
    x,
    y,
    width: rects.floating.width,
    height: rects.floating.height
  } : rects.reference;
  const offsetParent = await (platform3.getOffsetParent == null ? void 0 : platform3.getOffsetParent(elements.floating));
  const offsetScale = await (platform3.isElement == null ? void 0 : platform3.isElement(offsetParent)) && await (platform3.getScale == null ? void 0 : platform3.getScale(offsetParent)) || {
    x: 1,
    y: 1
  };
  const elementClientRect = rectToClientRect(platform3.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform3.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements,
    rect,
    offsetParent,
    strategy
  }) : rect);
  return {
    top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
    bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
    left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
    right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
  };
}
var MAX_RESET_COUNT = 50;
var computePosition = async (reference, floating, config) => {
  const {
    placement = "bottom",
    strategy = "absolute",
    middleware = [],
    platform: platform3
  } = config;
  const platformWithDetectOverflow = platform3.detectOverflow ? platform3 : {
    ...platform3,
    detectOverflow
  };
  const rtl = await (platform3.isRTL == null ? void 0 : platform3.isRTL(floating));
  let rects = await platform3.getElementRects({
    reference,
    floating,
    strategy
  });
  let {
    x,
    y
  } = computeCoordsFromPlacement(rects, placement, rtl);
  let statefulPlacement = placement;
  let resetCount = 0;
  const middlewareData = {};
  for (let i = 0; i < middleware.length; i++) {
    const currentMiddleware = middleware[i];
    if (!currentMiddleware) {
      continue;
    }
    const {
      name,
      fn
    } = currentMiddleware;
    const {
      x: nextX,
      y: nextY,
      data,
      reset
    } = await fn({
      x,
      y,
      initialPlacement: placement,
      placement: statefulPlacement,
      strategy,
      middlewareData,
      rects,
      platform: platformWithDetectOverflow,
      elements: {
        reference,
        floating
      }
    });
    x = nextX != null ? nextX : x;
    y = nextY != null ? nextY : y;
    middlewareData[name] = {
      ...middlewareData[name],
      ...data
    };
    if (reset && resetCount < MAX_RESET_COUNT) {
      resetCount++;
      if (typeof reset === "object") {
        if (reset.placement) {
          statefulPlacement = reset.placement;
        }
        if (reset.rects) {
          rects = reset.rects === true ? await platform3.getElementRects({
            reference,
            floating,
            strategy
          }) : reset.rects;
        }
        ({
          x,
          y
        } = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
      }
      i = -1;
    }
  }
  return {
    x,
    y,
    placement: statefulPlacement,
    strategy,
    middlewareData
  };
};
var flip = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "flip",
    options,
    async fn(state) {
      var _middlewareData$arrow, _middlewareData$flip;
      const {
        placement,
        middlewareData,
        rects,
        initialPlacement,
        platform: platform3,
        elements
      } = state;
      const {
        mainAxis: checkMainAxis = true,
        crossAxis: checkCrossAxis = true,
        fallbackPlacements: specifiedFallbackPlacements,
        fallbackStrategy = "bestFit",
        fallbackAxisSideDirection = "none",
        flipAlignment = true,
        ...detectOverflowOptions
      } = evaluate(options, state);
      if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
        return {};
      }
      const side = getSide(placement);
      const initialSideAxis = getSideAxis(initialPlacement);
      const isBasePlacement = getSide(initialPlacement) === initialPlacement;
      const rtl = await (platform3.isRTL == null ? void 0 : platform3.isRTL(elements.floating));
      const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
      const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
      if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) {
        fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
      }
      const placements2 = [initialPlacement, ...fallbackPlacements];
      const overflow = await platform3.detectOverflow(state, detectOverflowOptions);
      const overflows = [];
      let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
      if (checkMainAxis) {
        overflows.push(overflow[side]);
      }
      if (checkCrossAxis) {
        const sides2 = getAlignmentSides(placement, rects, rtl);
        overflows.push(overflow[sides2[0]], overflow[sides2[1]]);
      }
      overflowsData = [...overflowsData, {
        placement,
        overflows
      }];
      if (!overflows.every((side2) => side2 <= 0)) {
        var _middlewareData$flip2, _overflowsData$filter;
        const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
        const nextPlacement = placements2[nextIndex];
        if (nextPlacement) {
          const ignoreCrossAxisOverflow = checkCrossAxis === "alignment" ? initialSideAxis !== getSideAxis(nextPlacement) : false;
          if (!ignoreCrossAxisOverflow || // We leave the current main axis only if every placement on that axis
          // overflows the main axis.
          overflowsData.every((d) => getSideAxis(d.placement) === initialSideAxis ? d.overflows[0] > 0 : true)) {
            return {
              data: {
                index: nextIndex,
                overflows: overflowsData
              },
              reset: {
                placement: nextPlacement
              }
            };
          }
        }
        let resetPlacement = (_overflowsData$filter = overflowsData.filter((d) => d.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
        if (!resetPlacement) {
          switch (fallbackStrategy) {
            case "bestFit": {
              var _overflowsData$filter2;
              const placement2 = (_overflowsData$filter2 = overflowsData.filter((d) => {
                if (hasFallbackAxisSideDirection) {
                  const currentSideAxis = getSideAxis(d.placement);
                  return currentSideAxis === initialSideAxis || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  currentSideAxis === "y";
                }
                return true;
              }).map((d) => [d.placement, d.overflows.filter((overflow2) => overflow2 > 0).reduce((acc, overflow2) => acc + overflow2, 0)]).sort((a, b) => a[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
              if (placement2) {
                resetPlacement = placement2;
              }
              break;
            }
            case "initialPlacement":
              resetPlacement = initialPlacement;
              break;
          }
        }
        if (placement !== resetPlacement) {
          return {
            reset: {
              placement: resetPlacement
            }
          };
        }
      }
      return {};
    }
  };
};
var originSides = /* @__PURE__ */ new Set(["left", "top"]);
async function convertValueToCoords(state, options) {
  const {
    placement,
    platform: platform3,
    elements
  } = state;
  const rtl = await (platform3.isRTL == null ? void 0 : platform3.isRTL(elements.floating));
  const side = getSide(placement);
  const alignment = getAlignment(placement);
  const isVertical = getSideAxis(placement) === "y";
  const mainAxisMulti = originSides.has(side) ? -1 : 1;
  const crossAxisMulti = rtl && isVertical ? -1 : 1;
  const rawValue = evaluate(options, state);
  let {
    mainAxis,
    crossAxis,
    alignmentAxis
  } = typeof rawValue === "number" ? {
    mainAxis: rawValue,
    crossAxis: 0,
    alignmentAxis: null
  } : {
    mainAxis: rawValue.mainAxis || 0,
    crossAxis: rawValue.crossAxis || 0,
    alignmentAxis: rawValue.alignmentAxis
  };
  if (alignment && typeof alignmentAxis === "number") {
    crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis;
  }
  return isVertical ? {
    x: crossAxis * crossAxisMulti,
    y: mainAxis * mainAxisMulti
  } : {
    x: mainAxis * mainAxisMulti,
    y: crossAxis * crossAxisMulti
  };
}
var offset = function(options) {
  if (options === void 0) {
    options = 0;
  }
  return {
    name: "offset",
    options,
    async fn(state) {
      var _middlewareData$offse, _middlewareData$arrow;
      const {
        x,
        y,
        placement,
        middlewareData
      } = state;
      const diffCoords = await convertValueToCoords(state, options);
      if (placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
        return {};
      }
      return {
        x: x + diffCoords.x,
        y: y + diffCoords.y,
        data: {
          ...diffCoords,
          placement
        }
      };
    }
  };
};
var shift = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "shift",
    options,
    async fn(state) {
      const {
        x,
        y,
        placement,
        platform: platform3
      } = state;
      const {
        mainAxis: checkMainAxis = true,
        crossAxis: checkCrossAxis = false,
        limiter = {
          fn: (_ref) => {
            let {
              x: x2,
              y: y2
            } = _ref;
            return {
              x: x2,
              y: y2
            };
          }
        },
        ...detectOverflowOptions
      } = evaluate(options, state);
      const coords = {
        x,
        y
      };
      const overflow = await platform3.detectOverflow(state, detectOverflowOptions);
      const crossAxis = getSideAxis(placement);
      const mainAxis = getOppositeAxis(crossAxis);
      let mainAxisCoord = coords[mainAxis];
      let crossAxisCoord = coords[crossAxis];
      const clampCoord = (axis, coord) => clamp(coord + overflow[axis === "y" ? "top" : "left"], coord, coord - overflow[axis === "y" ? "bottom" : "right"]);
      if (checkMainAxis) {
        mainAxisCoord = clampCoord(mainAxis, mainAxisCoord);
      }
      if (checkCrossAxis) {
        crossAxisCoord = clampCoord(crossAxis, crossAxisCoord);
      }
      const limitedCoords = limiter.fn({
        ...state,
        [mainAxis]: mainAxisCoord,
        [crossAxis]: crossAxisCoord
      });
      return {
        ...limitedCoords,
        data: {
          x: limitedCoords.x - x,
          y: limitedCoords.y - y,
          enabled: {
            [mainAxis]: checkMainAxis,
            [crossAxis]: checkCrossAxis
          }
        }
      };
    }
  };
};
var limitShift = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    options,
    fn(state) {
      var _rawOffset$mainAxis, _rawOffset$crossAxis;
      const {
        x,
        y,
        placement,
        rects,
        middlewareData
      } = state;
      const {
        offset: offset4 = 0,
        mainAxis: checkMainAxis = true,
        crossAxis: checkCrossAxis = true
      } = evaluate(options, state);
      const coords = {
        x,
        y
      };
      const crossAxis = getSideAxis(placement);
      const mainAxis = getOppositeAxis(crossAxis);
      let mainAxisCoord = coords[mainAxis];
      let crossAxisCoord = coords[crossAxis];
      const rawOffset = evaluate(offset4, state);
      const computedOffset = typeof rawOffset === "number" ? {
        mainAxis: rawOffset,
        crossAxis: 0
      } : {
        mainAxis: (_rawOffset$mainAxis = rawOffset.mainAxis) != null ? _rawOffset$mainAxis : 0,
        crossAxis: (_rawOffset$crossAxis = rawOffset.crossAxis) != null ? _rawOffset$crossAxis : 0
      };
      if (checkMainAxis) {
        const len = mainAxis === "y" ? "height" : "width";
        const limitMin = rects.reference[mainAxis] - rects.floating[len] + computedOffset.mainAxis;
        const limitMax = rects.reference[mainAxis] + rects.reference[len] - computedOffset.mainAxis;
        if (mainAxisCoord < limitMin) {
          mainAxisCoord = limitMin;
        } else if (mainAxisCoord > limitMax) {
          mainAxisCoord = limitMax;
        }
      }
      if (checkCrossAxis) {
        var _middlewareData$offse, _middlewareData$offse2;
        const len = mainAxis === "y" ? "width" : "height";
        const isOriginSide = originSides.has(getSide(placement));
        const limitMin = rects.reference[crossAxis] - rects.floating[len] + (isOriginSide ? ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse[crossAxis]) || 0 : 0) + (isOriginSide ? 0 : computedOffset.crossAxis);
        const limitMax = rects.reference[crossAxis] + rects.reference[len] + (isOriginSide ? 0 : ((_middlewareData$offse2 = middlewareData.offset) == null ? void 0 : _middlewareData$offse2[crossAxis]) || 0) - (isOriginSide ? computedOffset.crossAxis : 0);
        if (crossAxisCoord < limitMin) {
          crossAxisCoord = limitMin;
        } else if (crossAxisCoord > limitMax) {
          crossAxisCoord = limitMax;
        }
      }
      return {
        [mainAxis]: mainAxisCoord,
        [crossAxis]: crossAxisCoord
      };
    }
  };
};
var size = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "size",
    options,
    async fn(state) {
      const {
        placement,
        rects,
        platform: platform3,
        elements
      } = state;
      const {
        apply = () => {
        },
        ...detectOverflowOptions
      } = evaluate(options, state);
      const overflow = await platform3.detectOverflow(state, detectOverflowOptions);
      const side = getSide(placement);
      const alignment = getAlignment(placement);
      const isYAxis = getSideAxis(placement) === "y";
      const {
        width,
        height
      } = rects.floating;
      let heightSide;
      let widthSide;
      if (side === "top" || side === "bottom") {
        heightSide = side;
        widthSide = alignment === (await (platform3.isRTL == null ? void 0 : platform3.isRTL(elements.floating)) ? "start" : "end") ? "left" : "right";
      } else {
        widthSide = side;
        heightSide = alignment === "end" ? "top" : "bottom";
      }
      const maximumClippingHeight = height - overflow.top - overflow.bottom;
      const maximumClippingWidth = width - overflow.left - overflow.right;
      const overflowAvailableHeight = min(height - overflow[heightSide], maximumClippingHeight);
      const overflowAvailableWidth = min(width - overflow[widthSide], maximumClippingWidth);
      const shiftData = state.middlewareData.shift;
      const noShift = !shiftData;
      let availableHeight2 = overflowAvailableHeight;
      let availableWidth2 = overflowAvailableWidth;
      if (shiftData != null && shiftData.enabled.x) {
        availableWidth2 = maximumClippingWidth;
      }
      if (shiftData != null && shiftData.enabled.y) {
        availableHeight2 = maximumClippingHeight;
      }
      if (noShift && !alignment) {
        if (isYAxis) {
          availableWidth2 = width - 2 * max(overflow.left, overflow.right);
        } else {
          availableHeight2 = height - 2 * max(overflow.top, overflow.bottom);
        }
      }
      await apply({
        ...state,
        availableWidth: availableWidth2,
        availableHeight: availableHeight2
      });
      const nextDimensions = await platform3.getDimensions(elements.floating);
      if (width !== nextDimensions.width || height !== nextDimensions.height) {
        return {
          reset: {
            rects: true
          }
        };
      }
      return {};
    }
  };
};

// node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
function getCssDimensions(element) {
  const css = getComputedStyle2(element);
  let width = parseFloat(css.width) || 0;
  let height = parseFloat(css.height) || 0;
  const hasOffset = isHTMLElement(element);
  const offsetWidth = hasOffset ? element.offsetWidth : width;
  const offsetHeight = hasOffset ? element.offsetHeight : height;
  const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
  if (shouldFallback) {
    width = offsetWidth;
    height = offsetHeight;
  }
  return {
    width,
    height,
    $: shouldFallback
  };
}
function unwrapElement(element) {
  return !isElement(element) ? element.contextElement : element;
}
function getScale(element) {
  const domElement = unwrapElement(element);
  if (!isHTMLElement(domElement)) {
    return createCoords(1);
  }
  const rect = domElement.getBoundingClientRect();
  const {
    width,
    height,
    $
  } = getCssDimensions(domElement);
  let x = ($ ? round(rect.width) : rect.width) / width;
  let y = ($ ? round(rect.height) : rect.height) / height;
  if (!x || !Number.isFinite(x)) {
    x = 1;
  }
  if (!y || !Number.isFinite(y)) {
    y = 1;
  }
  return {
    x,
    y
  };
}
var noOffsets = /* @__PURE__ */ createCoords(0);
function getVisualOffsets(element) {
  const win = getWindow(element);
  if (!isWebKit() || !win.visualViewport) {
    return noOffsets;
  }
  return {
    x: win.visualViewport.offsetLeft,
    y: win.visualViewport.offsetTop
  };
}
function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
  if (isFixed === void 0) {
    isFixed = false;
  }
  return !!floatingOffsetParent && isFixed && floatingOffsetParent === getWindow(element);
}
function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
  if (includeScale === void 0) {
    includeScale = false;
  }
  if (isFixedStrategy === void 0) {
    isFixedStrategy = false;
  }
  const clientRect = element.getBoundingClientRect();
  const domElement = unwrapElement(element);
  let scale = createCoords(1);
  if (includeScale) {
    if (offsetParent) {
      if (isElement(offsetParent)) {
        scale = getScale(offsetParent);
      }
    } else {
      scale = getScale(element);
    }
  }
  const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
  let x = (clientRect.left + visualOffsets.x) / scale.x;
  let y = (clientRect.top + visualOffsets.y) / scale.y;
  let width = clientRect.width / scale.x;
  let height = clientRect.height / scale.y;
  if (domElement && offsetParent) {
    const win = getWindow(domElement);
    const offsetWin = isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
    let currentWin = win;
    let currentIFrame = getFrameElement(currentWin);
    while (currentIFrame && offsetWin !== currentWin) {
      const iframeScale = getScale(currentIFrame);
      const iframeRect = currentIFrame.getBoundingClientRect();
      const css = getComputedStyle2(currentIFrame);
      const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
      const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
      x *= iframeScale.x;
      y *= iframeScale.y;
      width *= iframeScale.x;
      height *= iframeScale.y;
      x += left;
      y += top;
      currentWin = getWindow(currentIFrame);
      currentIFrame = getFrameElement(currentWin);
    }
  }
  return rectToClientRect({
    width,
    height,
    x,
    y
  });
}
function getWindowScrollBarX(element, rect) {
  const leftScroll = getNodeScroll(element).scrollLeft;
  if (!rect) {
    return getBoundingClientRect(getDocumentElement(element)).left + leftScroll;
  }
  return rect.left + leftScroll;
}
function getHTMLOffset(documentElement, scroll) {
  const htmlRect = documentElement.getBoundingClientRect();
  const x = htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect);
  const y = htmlRect.top + scroll.scrollTop;
  return {
    x,
    y
  };
}
function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
  let {
    elements,
    rect,
    offsetParent,
    strategy
  } = _ref;
  const isFixed = strategy === "fixed";
  const documentElement = getDocumentElement(offsetParent);
  const topLayer = elements ? isTopLayer(elements.floating) : false;
  if (offsetParent === documentElement || topLayer && isFixed) {
    return rect;
  }
  let scroll = {
    scrollLeft: 0,
    scrollTop: 0
  };
  let scale = createCoords(1);
  const offsets = createCoords(0);
  const isOffsetParentAnElement = isHTMLElement(offsetParent);
  if (isOffsetParentAnElement || !isFixed) {
    if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
      scroll = getNodeScroll(offsetParent);
    }
    if (isOffsetParentAnElement) {
      const offsetRect = getBoundingClientRect(offsetParent);
      scale = getScale(offsetParent);
      offsets.x = offsetRect.x + offsetParent.clientLeft;
      offsets.y = offsetRect.y + offsetParent.clientTop;
    }
  }
  const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
  return {
    width: rect.width * scale.x,
    height: rect.height * scale.y,
    x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
    y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
  };
}
function getClientRects(element) {
  return element.getClientRects ? Array.from(element.getClientRects()) : [];
}
function getDocumentRect(html) {
  const scroll = getNodeScroll(html);
  const body = html.ownerDocument.body;
  const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
  const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
  let x = -scroll.scrollLeft + getWindowScrollBarX(html);
  const y = -scroll.scrollTop;
  if (getComputedStyle2(body).direction === "rtl") {
    x += max(html.clientWidth, body.clientWidth) - width;
  }
  return {
    width,
    height,
    x,
    y
  };
}
var SCROLLBAR_MAX = 25;
function getViewportRect(element, strategy, rootBoundary) {
  if (rootBoundary === void 0) {
    rootBoundary = "viewport";
  }
  const isLayoutViewport = rootBoundary === "layoutViewport";
  const win = getWindow(element);
  const html = getDocumentElement(element);
  const visualViewport = win.visualViewport;
  let width = html.clientWidth;
  let height = html.clientHeight;
  let x = 0;
  let y = 0;
  if (visualViewport) {
    const layoutRelativeClientCoords = !isWebKit() || strategy === "fixed";
    if (isLayoutViewport) {
      if (!layoutRelativeClientCoords) {
        x = -visualViewport.offsetLeft;
        y = -visualViewport.offsetTop;
      }
    } else {
      width = visualViewport.width;
      height = visualViewport.height;
      if (layoutRelativeClientCoords) {
        x = visualViewport.offsetLeft;
        y = visualViewport.offsetTop;
      }
    }
  }
  const windowScrollbarX = getWindowScrollBarX(html);
  if (windowScrollbarX <= 0) {
    const doc = html.ownerDocument;
    const body = doc.body;
    const bodyStyles = getComputedStyle(body);
    const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
    const reservedWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
    const gutter = getComputedStyle(html).scrollbarGutter === "stable both-edges" ? reservedWidth / 2 : reservedWidth;
    if (gutter <= SCROLLBAR_MAX) {
      width -= gutter;
    }
  }
  return {
    width,
    height,
    x,
    y
  };
}
function getInnerBoundingClientRect(element, strategy) {
  const clientRect = getBoundingClientRect(element, true, strategy === "fixed");
  const top = clientRect.top + element.clientTop;
  const left = clientRect.left + element.clientLeft;
  const scale = getScale(element);
  const width = element.clientWidth * scale.x;
  const height = element.clientHeight * scale.y;
  const x = left * scale.x;
  const y = top * scale.y;
  return {
    width,
    height,
    x,
    y
  };
}
function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
  let rect;
  if (clippingAncestor === "viewport" || clippingAncestor === "layoutViewport") {
    rect = getViewportRect(element, strategy, clippingAncestor);
  } else if (clippingAncestor === "document") {
    rect = getDocumentRect(getDocumentElement(element));
  } else if (isElement(clippingAncestor)) {
    rect = getInnerBoundingClientRect(clippingAncestor, strategy);
  } else {
    const visualOffsets = getVisualOffsets(element);
    rect = {
      x: clippingAncestor.x - visualOffsets.x,
      y: clippingAncestor.y - visualOffsets.y,
      width: clippingAncestor.width,
      height: clippingAncestor.height
    };
  }
  return rectToClientRect(rect);
}
function getClippingElementAncestors(element, cache2) {
  const cachedResult = cache2.get(element);
  if (cachedResult) {
    return cachedResult;
  }
  let result = getOverflowAncestors(element, [], false).filter((el) => isElement(el) && getNodeName(el) !== "body");
  let lastKeptComputedStyle = null;
  const elementIsFixed = getComputedStyle2(element).position === "fixed";
  let currentNode = elementIsFixed ? getParentNode(element) : element;
  while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
    const computedStyle = getComputedStyle2(currentNode);
    const currentNodeIsContaining = isContainingBlock(currentNode);
    const lastPosition = lastKeptComputedStyle ? lastKeptComputedStyle.position : elementIsFixed ? "fixed" : "";
    const shouldDropCurrentNode = !currentNodeIsContaining && (lastPosition === "fixed" || lastPosition === "absolute" && computedStyle.position === "static");
    if (shouldDropCurrentNode) {
      result = result.filter((ancestor) => ancestor !== currentNode);
    } else {
      lastKeptComputedStyle = computedStyle;
    }
    currentNode = getParentNode(currentNode);
  }
  cache2.set(element, result);
  return result;
}
function getClippingRect(_ref) {
  let {
    element,
    boundary,
    rootBoundary,
    strategy
  } = _ref;
  const elementClippingAncestors = boundary === "clippingAncestors" ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary);
  const clippingAncestors = [...elementClippingAncestors, rootBoundary];
  const firstRect = getClientRectFromClippingAncestor(element, clippingAncestors[0], strategy);
  let top = firstRect.top;
  let right = firstRect.right;
  let bottom = firstRect.bottom;
  let left = firstRect.left;
  for (let i = 1; i < clippingAncestors.length; i++) {
    const rect = getClientRectFromClippingAncestor(element, clippingAncestors[i], strategy);
    top = max(rect.top, top);
    right = min(rect.right, right);
    bottom = min(rect.bottom, bottom);
    left = max(rect.left, left);
  }
  return {
    width: right - left,
    height: bottom - top,
    x: left,
    y: top
  };
}
function getDimensions(element) {
  const {
    width,
    height
  } = getCssDimensions(element);
  return {
    width,
    height
  };
}
function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
  const isOffsetParentAnElement = isHTMLElement(offsetParent);
  const documentElement = getDocumentElement(offsetParent);
  const isFixed = strategy === "fixed";
  const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
  let scroll = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const offsets = createCoords(0);
  if (isOffsetParentAnElement || !isFixed) {
    if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
      scroll = getNodeScroll(offsetParent);
    }
    if (isOffsetParentAnElement) {
      const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
      offsets.x = offsetRect.x + offsetParent.clientLeft;
      offsets.y = offsetRect.y + offsetParent.clientTop;
    }
  }
  if (!isOffsetParentAnElement && documentElement) {
    offsets.x = getWindowScrollBarX(documentElement);
  }
  const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
  const x = rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x;
  const y = rect.top + scroll.scrollTop - offsets.y - htmlOffset.y;
  return {
    x,
    y,
    width: rect.width,
    height: rect.height
  };
}
function isStaticPositioned(element) {
  return getComputedStyle2(element).position === "static";
}
function getTrueOffsetParent(element, polyfill) {
  if (!isHTMLElement(element) || getComputedStyle2(element).position === "fixed") {
    return null;
  }
  if (polyfill) {
    return polyfill(element);
  }
  let rawOffsetParent = element.offsetParent;
  if (getDocumentElement(element) === rawOffsetParent) {
    rawOffsetParent = rawOffsetParent.ownerDocument.body;
  }
  return rawOffsetParent;
}
function getOffsetParent(element, polyfill) {
  const win = getWindow(element);
  if (isTopLayer(element)) {
    return win;
  }
  if (!isHTMLElement(element)) {
    let svgOffsetParent = getParentNode(element);
    while (svgOffsetParent && !isLastTraversableNode(svgOffsetParent)) {
      if (isElement(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) {
        return svgOffsetParent;
      }
      svgOffsetParent = getParentNode(svgOffsetParent);
    }
    return win;
  }
  let offsetParent = getTrueOffsetParent(element, polyfill);
  while (offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent)) {
    offsetParent = getTrueOffsetParent(offsetParent, polyfill);
  }
  if (offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent)) {
    return win;
  }
  return offsetParent || getContainingBlock(element) || win;
}
var getElementRects = async function(data) {
  const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
  const getDimensionsFn = this.getDimensions;
  const floatingDimensions = await getDimensionsFn(data.floating);
  return {
    reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
    floating: {
      x: 0,
      y: 0,
      width: floatingDimensions.width,
      height: floatingDimensions.height
    }
  };
};
function isRTL(element) {
  return getComputedStyle2(element).direction === "rtl";
}
var platform2 = {
  convertOffsetParentRelativeRectToViewportRelativeRect,
  getDocumentElement,
  getClippingRect,
  getOffsetParent,
  getElementRects,
  getClientRects,
  getDimensions,
  getScale,
  isElement,
  isRTL
};
function rectsAreEqual(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
function observeMove(element, onMove, ancestorResize) {
  let io = null;
  let timeoutId;
  const root = getDocumentElement(element);
  function cleanup() {
    var _io;
    clearTimeout(timeoutId);
    (_io = io) == null || _io.disconnect();
    io = null;
  }
  function refresh(skip, threshold) {
    if (skip === void 0) {
      skip = false;
    }
    if (threshold === void 0) {
      threshold = 1;
    }
    cleanup();
    const elementRectForRootMargin = element.getBoundingClientRect();
    const {
      left,
      top,
      width,
      height
    } = elementRectForRootMargin;
    if (!skip) {
      onMove();
    }
    if (!width || !height) {
      return;
    }
    const insetTop = floor(top);
    const insetRight = floor(root.clientWidth - (left + width));
    const insetBottom = floor(root.clientHeight - (top + height));
    const insetLeft = floor(left);
    const rootMargin = -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px";
    const options = {
      rootMargin,
      threshold: max(0, min(1, threshold)) || 1
    };
    let isFirstUpdate = true;
    function handleObserve(entries) {
      const ratio = entries[0].intersectionRatio;
      if (!rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) {
        return refresh();
      }
      if (ratio !== threshold) {
        if (!isFirstUpdate) {
          return refresh();
        }
        if (!ratio) {
          timeoutId = setTimeout(() => {
            refresh(false, 1e-7);
          }, 1e3);
        } else {
          refresh(false, ratio);
        }
      }
      isFirstUpdate = false;
    }
    try {
      io = new IntersectionObserver(handleObserve, {
        ...options,
        // Handle <iframe>s
        root: root.ownerDocument
      });
    } catch (_e) {
      io = new IntersectionObserver(handleObserve, options);
    }
    io.observe(element);
  }
  const win = getWindow(element);
  const handleResize = () => refresh(ancestorResize);
  win.addEventListener("resize", handleResize);
  refresh(true);
  return () => {
    win.removeEventListener("resize", handleResize);
    cleanup();
  };
}
function autoUpdate(reference, floating, update2, options) {
  if (options === void 0) {
    options = {};
  }
  const {
    ancestorScroll = true,
    ancestorResize = true,
    elementResize = typeof ResizeObserver === "function",
    layoutShift = typeof IntersectionObserver === "function",
    animationFrame = false
  } = options;
  const referenceEl = unwrapElement(reference);
  const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...floating ? getOverflowAncestors(floating) : []] : [];
  ancestors.forEach((ancestor) => {
    ancestorScroll && ancestor.addEventListener("scroll", update2);
    ancestorResize && ancestor.addEventListener("resize", update2);
  });
  const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update2, ancestorResize) : null;
  let reobserveFrame = -1;
  let resizeObserver = null;
  if (elementResize) {
    resizeObserver = new ResizeObserver((_ref) => {
      let [firstEntry] = _ref;
      if (firstEntry && firstEntry.target === referenceEl && resizeObserver && floating) {
        resizeObserver.unobserve(floating);
        cancelAnimationFrame(reobserveFrame);
        reobserveFrame = requestAnimationFrame(() => {
          var _resizeObserver;
          (_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
        });
      }
      update2();
    });
    if (referenceEl && !animationFrame) {
      resizeObserver.observe(referenceEl);
    }
    if (floating) {
      resizeObserver.observe(floating);
    }
  }
  let frameId;
  let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
  if (animationFrame) {
    frameLoop();
  }
  function frameLoop() {
    const nextRefRect = getBoundingClientRect(reference);
    if (prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect)) {
      update2();
    }
    prevRefRect = nextRefRect;
    frameId = requestAnimationFrame(frameLoop);
  }
  update2();
  return () => {
    var _resizeObserver2;
    ancestors.forEach((ancestor) => {
      ancestorScroll && ancestor.removeEventListener("scroll", update2);
      ancestorResize && ancestor.removeEventListener("resize", update2);
    });
    cleanupIo == null || cleanupIo();
    (_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
    resizeObserver = null;
    if (animationFrame) {
      cancelAnimationFrame(frameId);
    }
  };
}
var offset2 = offset;
var shift2 = shift;
var flip2 = flip;
var size2 = size;
var limitShift2 = limitShift;
var computePosition2 = (reference, floating, options) => {
  const cache2 = /* @__PURE__ */ new Map();
  const mergedOptions = options != null ? options : {};
  const platformWithCache = {
    ...platform2,
    ...mergedOptions.platform,
    _c: cache2
  };
  return computePosition(reference, floating, {
    ...mergedOptions,
    platform: platformWithCache
  });
};

// node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs
init_react();
init_react();
var isClient = typeof document !== "undefined";
var noop2 = function noop3() {
};
var index = isClient ? useLayoutEffect : noop2;
function deepEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (typeof a === "function" && a.toString() === b.toString()) {
    return true;
  }
  let length;
  let i;
  let keys;
  if (a && b && typeof a === "object") {
    if (Array.isArray(a)) {
      length = a.length;
      if (length !== b.length) return false;
      for (i = length; i-- !== 0; ) {
        if (!deepEqual(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }
    keys = Object.keys(a);
    length = keys.length;
    if (length !== Object.keys(b).length) {
      return false;
    }
    for (i = length; i-- !== 0; ) {
      if (!{}.hasOwnProperty.call(b, keys[i])) {
        return false;
      }
    }
    for (i = length; i-- !== 0; ) {
      const key = keys[i];
      if (key === "_owner" && a.$$typeof) {
        continue;
      }
      if (!deepEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }
  return a !== a && b !== b;
}
function getDPR(element) {
  if (typeof window === "undefined") {
    return 1;
  }
  const win = element.ownerDocument.defaultView || window;
  return win.devicePixelRatio || 1;
}
function roundByDPR(element, value) {
  const dpr = getDPR(element);
  return Math.round(value * dpr) / dpr;
}
function useLatestRef(value) {
  const ref = useRef(value);
  index(() => {
    ref.current = value;
  });
  return ref;
}
function useFloating(options) {
  if (options === void 0) {
    options = {};
  }
  const {
    placement = "bottom",
    strategy = "absolute",
    middleware = [],
    platform: platform3,
    elements: {
      reference: externalReference,
      floating: externalFloating
    } = {},
    transform = true,
    whileElementsMounted,
    open: open2
  } = options;
  const [data, setData] = useState({
    x: 0,
    y: 0,
    strategy,
    placement,
    middlewareData: {},
    isPositioned: false
  });
  const [latestMiddleware, setLatestMiddleware] = useState(middleware);
  if (!deepEqual(latestMiddleware, middleware)) {
    setLatestMiddleware(middleware);
  }
  const [_reference, _setReference] = useState(null);
  const [_floating, _setFloating] = useState(null);
  const setReference = useCallback((node) => {
    if (node !== referenceRef.current) {
      referenceRef.current = node;
      _setReference(node);
    }
  }, []);
  const setFloating = useCallback((node) => {
    if (node !== floatingRef.current) {
      floatingRef.current = node;
      _setFloating(node);
    }
  }, []);
  const referenceEl = externalReference || _reference;
  const floatingEl = externalFloating || _floating;
  const referenceRef = useRef(null);
  const floatingRef = useRef(null);
  const dataRef = useRef(data);
  const hasWhileElementsMounted = whileElementsMounted != null;
  const whileElementsMountedRef = useLatestRef(whileElementsMounted);
  const platformRef = useLatestRef(platform3);
  const openRef = useLatestRef(open2);
  const update2 = useCallback(() => {
    if (!referenceRef.current || !floatingRef.current) {
      return;
    }
    const config = {
      placement,
      strategy,
      middleware: latestMiddleware
    };
    if (platformRef.current) {
      config.platform = platformRef.current;
    }
    computePosition2(referenceRef.current, floatingRef.current, config).then((data2) => {
      const fullData = {
        ...data2,
        // The floating element's position may be recomputed while it's closed
        // but still mounted (such as when transitioning out). To ensure
        // `isPositioned` will be `false` initially on the next open, avoid
        // setting it to `true` when `open === false` (must be specified).
        isPositioned: openRef.current !== false
      };
      if (isMountedRef.current && !deepEqual(dataRef.current, fullData)) {
        dataRef.current = fullData;
        flushSync(() => {
          setData(fullData);
        });
      }
    });
  }, [latestMiddleware, placement, strategy, platformRef, openRef]);
  index(() => {
    if (open2 === false && dataRef.current.isPositioned) {
      dataRef.current.isPositioned = false;
      setData((data2) => ({
        ...data2,
        isPositioned: false
      }));
    }
  }, [open2]);
  const isMountedRef = useRef(false);
  index(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  index(() => {
    if (referenceEl) referenceRef.current = referenceEl;
    if (floatingEl) floatingRef.current = floatingEl;
    if (referenceEl && floatingEl) {
      if (whileElementsMountedRef.current) {
        return whileElementsMountedRef.current(referenceEl, floatingEl, update2);
      }
      update2();
    }
  }, [referenceEl, floatingEl, update2, whileElementsMountedRef, hasWhileElementsMounted]);
  const refs = useMemo(() => ({
    reference: referenceRef,
    floating: floatingRef,
    setReference,
    setFloating
  }), [setReference, setFloating]);
  const elements = useMemo(() => ({
    reference: referenceEl,
    floating: floatingEl
  }), [referenceEl, floatingEl]);
  const floatingStyles = useMemo(() => {
    const initialStyles = {
      position: strategy,
      left: 0,
      top: 0
    };
    if (!elements.floating) {
      return initialStyles;
    }
    const x = roundByDPR(elements.floating, data.x);
    const y = roundByDPR(elements.floating, data.y);
    if (transform) {
      return {
        ...initialStyles,
        transform: "translate(" + x + "px, " + y + "px)",
        ...getDPR(elements.floating) >= 1.5 && {
          willChange: "transform"
        }
      };
    }
    return {
      position: strategy,
      left: x,
      top: y
    };
  }, [strategy, transform, elements.floating, data.x, data.y]);
  return useMemo(() => ({
    ...data,
    update: update2,
    refs,
    elements,
    floatingStyles
  }), [data, update2, refs, elements, floatingStyles]);
}
var offset3 = (options, deps) => {
  const result = offset2(options);
  return {
    name: result.name,
    fn: result.fn,
    options: [options, deps]
  };
};
var shift3 = (options, deps) => {
  const result = shift2(options);
  return {
    name: result.name,
    fn: result.fn,
    options: [options, deps]
  };
};
var limitShift3 = (options, deps) => {
  const result = limitShift2(options);
  return {
    fn: result.fn,
    options: [options, deps]
  };
};
var flip3 = (options, deps) => {
  const result = flip2(options);
  return {
    name: result.name,
    fn: result.fn,
    options: [options, deps]
  };
};
var size3 = (options, deps) => {
  const result = size2(options);
  return {
    name: result.name,
    fn: result.fn,
    options: [options, deps]
  };
};

// node_modules/@base-ui/react/toolbar/root/ToolbarRootContext.mjs
init_react();
var ToolbarRootContext = /* @__PURE__ */ createContext(void 0);
if (false) ToolbarRootContext.displayName = "ToolbarRootContext";
function useToolbarRootContext(optional) {
  const context = useContext(ToolbarRootContext);
  if (context === void 0 && !optional) {
    throw new Error(false ? "Base UI: ToolbarRootContext is missing. Toolbar parts must be placed within <Toolbar.Root>." : formatErrorMessage_default(69));
  }
  return context;
}

// node_modules/@base-ui/react/internals/composite/composite.mjs
var ARROW_UP2 = "ArrowUp";
var ARROW_DOWN2 = "ArrowDown";
var ARROW_LEFT2 = "ArrowLeft";
var ARROW_RIGHT2 = "ArrowRight";
var HOME = "Home";
var END = "End";
var COMPOSITE_KEYS = /* @__PURE__ */ new Set([ARROW_UP2, ARROW_DOWN2, ARROW_LEFT2, ARROW_RIGHT2, HOME, END]);
var SHIFT = "Shift";
var MODIFIER_KEYS = [SHIFT, "Control", "Alt", "Meta"];
function isInputElement(element) {
  return isHTMLElement(element) && element.tagName === "INPUT";
}
function isNativeInput(element) {
  if (isInputElement(element) && element.selectionStart != null) {
    return true;
  }
  if (isHTMLElement(element) && element.tagName === "TEXTAREA") {
    return true;
  }
  return false;
}
function scrollIntoViewIfNeeded(scrollContainer, element, direction, orientation) {
  if (!scrollContainer || !element || !element.scrollTo) {
    return;
  }
  let targetX = scrollContainer.scrollLeft;
  let targetY = scrollContainer.scrollTop;
  const isOverflowingX = scrollContainer.clientWidth < scrollContainer.scrollWidth;
  const isOverflowingY = scrollContainer.clientHeight < scrollContainer.scrollHeight;
  if (isOverflowingX && orientation !== "vertical") {
    const elementOffsetLeft = getOffset(scrollContainer, element, "left");
    const containerStyles = getStyles(scrollContainer);
    const elementStyles = getStyles(element);
    if (direction === "ltr") {
      if (elementOffsetLeft + element.offsetWidth + elementStyles.scrollMarginRight > scrollContainer.scrollLeft + scrollContainer.clientWidth - containerStyles.scrollPaddingRight) {
        targetX = elementOffsetLeft + element.offsetWidth + elementStyles.scrollMarginRight - scrollContainer.clientWidth + containerStyles.scrollPaddingRight;
      } else if (elementOffsetLeft - elementStyles.scrollMarginLeft < scrollContainer.scrollLeft + containerStyles.scrollPaddingLeft) {
        targetX = elementOffsetLeft - elementStyles.scrollMarginLeft - containerStyles.scrollPaddingLeft;
      }
    }
    if (direction === "rtl") {
      if (elementOffsetLeft - elementStyles.scrollMarginLeft < scrollContainer.scrollLeft + containerStyles.scrollPaddingLeft) {
        targetX = elementOffsetLeft - elementStyles.scrollMarginLeft - containerStyles.scrollPaddingLeft;
      } else if (elementOffsetLeft + element.offsetWidth + elementStyles.scrollMarginRight > scrollContainer.scrollLeft + scrollContainer.clientWidth - containerStyles.scrollPaddingRight) {
        targetX = elementOffsetLeft + element.offsetWidth + elementStyles.scrollMarginRight - scrollContainer.clientWidth + containerStyles.scrollPaddingRight;
      }
    }
  }
  if (isOverflowingY && orientation !== "horizontal") {
    const elementOffsetTop = getOffset(scrollContainer, element, "top");
    const containerStyles = getStyles(scrollContainer);
    const elementStyles = getStyles(element);
    if (elementOffsetTop - elementStyles.scrollMarginTop < scrollContainer.scrollTop + containerStyles.scrollPaddingTop) {
      targetY = elementOffsetTop - elementStyles.scrollMarginTop - containerStyles.scrollPaddingTop;
    } else if (elementOffsetTop + element.offsetHeight + elementStyles.scrollMarginBottom > scrollContainer.scrollTop + scrollContainer.clientHeight - containerStyles.scrollPaddingBottom) {
      targetY = elementOffsetTop + element.offsetHeight + elementStyles.scrollMarginBottom - scrollContainer.clientHeight + containerStyles.scrollPaddingBottom;
    }
  }
  scrollContainer.scrollTo({
    left: targetX,
    top: targetY,
    behavior: "auto"
  });
}
function getOffset(ancestor, element, side) {
  const propName = side === "left" ? "offsetLeft" : "offsetTop";
  let result = 0;
  while (element.offsetParent) {
    result += element[propName];
    if (element.offsetParent === ancestor) {
      break;
    }
    element = element.offsetParent;
  }
  return result;
}
function getStyles(element) {
  const styles = getComputedStyle(element);
  return {
    scrollMarginTop: parseFloat(styles.scrollMarginTop) || 0,
    scrollMarginRight: parseFloat(styles.scrollMarginRight) || 0,
    scrollMarginBottom: parseFloat(styles.scrollMarginBottom) || 0,
    scrollMarginLeft: parseFloat(styles.scrollMarginLeft) || 0,
    scrollPaddingTop: parseFloat(styles.scrollPaddingTop) || 0,
    scrollPaddingRight: parseFloat(styles.scrollPaddingRight) || 0,
    scrollPaddingBottom: parseFloat(styles.scrollPaddingBottom) || 0,
    scrollPaddingLeft: parseFloat(styles.scrollPaddingLeft) || 0
  };
}

// node_modules/@base-ui/react/internals/getDisabledMountTransitionStyles.mjs
function getDisabledMountTransitionStyles(transitionStatus) {
  return transitionStatus === "starting" ? DISABLED_TRANSITIONS_STYLE : EMPTY_OBJECT;
}

// node_modules/@base-ui/react/menu/submenu-root/MenuSubmenuRootContext.mjs
init_react();
var MenuSubmenuRootContext = /* @__PURE__ */ createContext(void 0);
if (false) MenuSubmenuRootContext.displayName = "MenuSubmenuRootContext";
function useMenuSubmenuRootContext() {
  return useContext(MenuSubmenuRootContext);
}

// node_modules/@base-ui/react/internals/resolveRenderedId.mjs
init_react();
function resolveRenderedId(props, fallbackId) {
  const render = unwrapLazyRenderProp(props.render);
  if (/* @__PURE__ */ isValidElement(render)) {
    const renderProps = render.props;
    if (Object.hasOwn(renderProps, "id")) {
      return renderProps.id ?? "";
    }
  }
  return props.id ?? fallbackId;
}
function useRenderedId(props, defaultId, setId) {
  const id = resolveRenderedId(props, defaultId);
  const registeredId = id === defaultId ? void 0 : id;
  const ref = useCallback((element) => setId?.(element ? registeredId : void 0), [registeredId, setId]);
  return [id, ref];
}

// node_modules/@base-ui/react/internals/resolvePopupLabel.mjs
init_react();
function resolvePopupLabel(props, activeTriggerElement, activeTriggerId) {
  const render = unwrapLazyRenderProp(props.render);
  const renderedElementProps = /* @__PURE__ */ isValidElement(render) ? render.props : void 0;
  const ariaLabel = props["aria-label"] ?? renderedElementProps?.["aria-label"];
  let ariaLabelledBy = props["aria-labelledby"] ?? renderedElementProps?.["aria-labelledby"];
  if (ariaLabelledBy == null && !ariaLabel) {
    ariaLabelledBy = activeTriggerElement ? activeTriggerElement.id || void 0 : activeTriggerId || void 0;
  }
  return ariaLabelledBy;
}

// node_modules/@base-ui/react/menu/popup/MenuPopup.mjs
var MenuPopupPlain = /* @__PURE__ */ forwardRef(function MenuPopupPlain2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    finalFocus,
    id: idProp,
    initialFocus: initialFocusProp,
    ...elementProps
  } = componentProps;
  const {
    store,
    defaultFloatingId,
    setRenderedFloatingId,
    virtualFocus,
    orientation
  } = useMenuRootContext();
  const inheritedSubmenuRootContext = useMenuSubmenuRootContext();
  const {
    side,
    align
  } = useMenuPositionerContext();
  const insideToolbar = useToolbarRootContext(true) != null;
  const open2 = store.useState("open");
  const transitionStatus = store.useState("transitionStatus");
  const popupProps = store.useState("popupProps");
  const mounted = store.useState("mounted");
  const instantType = store.useState("instantType");
  const activeTriggerElement = store.useState("activeTriggerElement");
  const parent = store.useState("parent");
  const lastOpenChangeReason = store.useState("lastOpenChangeReason");
  const rootId = store.useState("rootId");
  const floatingContext = store.useState("floatingRootContext");
  const floatingTreeRoot = store.useState("floatingTreeRoot");
  const closeDelay = store.useState("closeDelay");
  const hoverEnabled = store.useState("hoverEnabled");
  const disabled2 = store.useState("disabled");
  const openMethod = store.useState("openMethod");
  const activeTriggerId = store.useState("activeTriggerId");
  const listElement = store.useState("listElement");
  const [id, registerIdRef] = useRenderedId(componentProps, defaultFloatingId, setRenderedFloatingId);
  const ariaLabelledBy = resolvePopupLabel(componentProps, activeTriggerElement, activeTriggerId);
  const submenuRootContext = parent.type === "menu" ? inheritedSubmenuRootContext : void 0;
  const isContextMenu = parent.type === "context-menu";
  let initialFocus = initialFocusProp ?? parent.type !== "menu";
  if (initialFocusProp === void 0 && listElement && parent.type !== "menu") {
    initialFocus = () => {
      if (store.state.activeIndex !== null) {
        return false;
      }
      return listElement;
    };
  }
  useOpenChangeComplete({
    open: open2,
    ref: store.context.popupRef,
    onComplete() {
      if (open2) {
        store.context.onOpenChangeComplete?.(true);
      }
    }
  });
  useEffect(() => {
    function handleClose(event) {
      store.setOpen(false, createChangeEventDetails(event.reason, event.domEvent));
    }
    floatingTreeRoot.events.on("close", handleClose);
    return () => {
      floatingTreeRoot.events.off("close", handleClose);
    };
  }, [floatingTreeRoot.events, store]);
  useHoverFloatingInteraction(floatingContext, {
    enabled: hoverEnabled && !disabled2 && !isContextMenu && parent.type !== "menubar",
    closeDelay
  });
  const setPopupElement = store.useStateSetter("popupElement");
  const useParentHandoff = useContext(MenuFilterImplContext)?.useParentHandoff ?? useNoParentHandoff;
  const {
    parentVirtualFocusRef,
    handleFocus
  } = useParentHandoff(store, parent, open2, virtualFocus);
  const state = {
    transitionStatus,
    side,
    align,
    open: open2,
    nested: parent.type === "menu",
    instant: instantType
  };
  const element = useRenderElement("div", componentProps, {
    state,
    ref: [forwardedRef, store.context.popupRef, setPopupElement, registerIdRef],
    stateAttributesMapping: popupTransitionStateMapping,
    props: [popupProps, {
      id,
      // A rendered `Menu.List` carries the `menu` semantics instead.
      ...listElement ? {
        role: "presentation"
      } : {
        role: "menu",
        // `menu` is implicitly vertical, so only the non-default value needs to be
        // rendered.
        "aria-orientation": orientation === "horizontal" ? "horizontal" : void 0,
        "aria-labelledby": ariaLabelledBy
      },
      onKeyDown(event) {
        submenuRootContext?.onPopupKeyDown?.(event);
        if (insideToolbar && COMPOSITE_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      },
      onFocus: handleFocus
    }, getDisabledMountTransitionStyles(transitionStatus), elementProps, {
      "data-rootownerid": rootId
    }]
  });
  let returnFocus = parent.type === void 0 || isContextMenu;
  if (activeTriggerElement || parent.type === "menubar" && lastOpenChangeReason !== reason_parts_exports.outsidePress) {
    returnFocus = true;
  }
  const dynamicReturnFocus = submenuRootContext?.getReturnElement ?? parentVirtualFocusRef;
  return /* @__PURE__ */ jsx(FloatingFocusManager, {
    context: floatingContext,
    openInteractionType: openMethod,
    modal: isContextMenu,
    disabled: !mounted,
    returnFocus: finalFocus ?? dynamicReturnFocus ?? returnFocus,
    explicitReturnFocus: finalFocus === void 0 && dynamicReturnFocus ? false : void 0,
    initialFocus,
    restoreFocus: true,
    getInsideElements: parent.type === void 0 ? () => [store.context.beforeTriggerFocusGuardRef.current] : void 0,
    externalTree: parent.type !== "menubar" ? floatingTreeRoot : void 0,
    previousFocusableElement: activeTriggerElement,
    nextFocusableElement: parent.type === void 0 ? store.context.triggerFocusTargetRef : void 0,
    beforeContentFocusGuardRef: store.context.beforeContentFocusGuardRef,
    children: element
  });
});
if (false) MenuPopupPlain.displayName = "MenuPopupPlain";
var NO_PARENT_HANDOFF = {
  parentVirtualFocusRef: void 0,
  handleFocus: void 0
};
function useNoParentHandoff() {
  return NO_PARENT_HANDOFF;
}
var MenuPopup = /* @__PURE__ */ forwardRef(function MenuPopup2(props, forwardedRef) {
  const Popup = useMenuFilterImpl()?.Popup ?? MenuPopupPlain;
  return /* @__PURE__ */ jsx(Popup, {
    ...props,
    ref: forwardedRef
  });
});
if (false) MenuPopup.displayName = "MenuPopup";

// node_modules/@base-ui/react/menu/portal/MenuPortal.mjs
init_react();

// node_modules/@base-ui/react/menu/portal/MenuPortalContext.mjs
init_react();
var MenuPortalContext = /* @__PURE__ */ createContext(void 0);
if (false) MenuPortalContext.displayName = "MenuPortalContext";
function useMenuPortalContext() {
  const value = useContext(MenuPortalContext);
  if (value === void 0) {
    throw new Error(false ? "Base UI: <Menu.Portal> is missing." : formatErrorMessage_default(32));
  }
  return value;
}

// node_modules/@base-ui/react/menu/portal/MenuPortal.mjs
var MenuPortal = /* @__PURE__ */ forwardRef(function MenuPortal2(props, forwardedRef) {
  const {
    keepMounted = false,
    ...portalProps
  } = props;
  const {
    store,
    parent
  } = useMenuRootContext();
  const mounted = store.useState("mounted");
  const shouldRender = mounted || keepMounted;
  if (!shouldRender) {
    return null;
  }
  const portalOwnerRole = parent.type === "menu" || parent.type === "menubar" ? "group" : void 0;
  return /* @__PURE__ */ jsx(MenuPortalContext.Provider, {
    value: keepMounted,
    children: /* @__PURE__ */ jsx(FloatingPortal, {
      ref: forwardedRef,
      ...portalProps,
      portalOwnerRole
    })
  });
});
if (false) MenuPortal.displayName = "MenuPortal";

// node_modules/@base-ui/react/menu/positioner/MenuPositioner.mjs
init_react();

// node_modules/@base-ui/utils/inertValue.mjs
function inertValue(value) {
  if (isReactVersionAtLeast(19)) {
    return value;
  }
  return value ? "true" : void 0;
}

// node_modules/@base-ui/react/internals/useAnchorPositioning.mjs
init_react();

// node_modules/@base-ui/react/floating-ui-react/hooks/useFloating.mjs
init_react();
function useBaseUIFloating(options) {
  const {
    nodeId,
    externalTree,
    rootContext: store
  } = options;
  const referenceElement = store.useState("referenceElement");
  const floatingElement = store.useState("floatingElement");
  const domReferenceElement = store.useState("domReferenceElement");
  const open2 = store.useState("open");
  const floatingId = store.useState("floatingId");
  const [positionReference, setPositionReferenceRaw] = useState(null);
  const domReferenceRef = useRef(null);
  const tree = useFloatingTree(externalTree);
  const storeElements = useMemo(() => ({
    reference: referenceElement,
    floating: floatingElement,
    domReference: domReferenceElement
  }), [referenceElement, floatingElement, domReferenceElement]);
  const position = useFloating({
    ...options,
    elements: {
      ...storeElements,
      ...positionReference && {
        reference: positionReference
      }
    }
  });
  const setPositionReference = useCallback((node) => {
    const computedPositionReference = isElement(node) ? {
      getBoundingClientRect: () => node.getBoundingClientRect(),
      getClientRects: () => node.getClientRects(),
      contextElement: node
    } : node;
    setPositionReferenceRaw(computedPositionReference);
    position.refs.setReference(computedPositionReference);
  }, [position.refs]);
  const refs = useMemo(() => ({
    ...position.refs,
    setPositionReference,
    domReference: domReferenceRef
  }), [position.refs, setPositionReference]);
  const elements = useMemo(() => ({
    ...position.elements,
    domReference: domReferenceElement
  }), [position.elements, domReferenceElement]);
  const context = useMemo(() => ({
    ...position,
    dataRef: store.context.dataRef,
    open: open2,
    onOpenChange: store.setOpen,
    events: store.context.events,
    floatingId,
    refs,
    elements,
    nodeId,
    rootStore: store
  }), [position, refs, elements, nodeId, store, open2, floatingId]);
  useIsoLayoutEffect(() => {
    if (domReferenceElement) {
      domReferenceRef.current = domReferenceElement;
    }
  }, [domReferenceElement]);
  useIsoLayoutEffect(() => {
    store.context.dataRef.current.floatingContext = context;
    const node = tree?.nodesRef.current.find((n) => n.id === nodeId);
    if (node) {
      node.context = context;
    }
  });
  return useMemo(() => ({
    ...position,
    context,
    refs,
    elements,
    rootStore: store
  }), [position, refs, elements, context, store]);
}

// node_modules/@base-ui/react/internals/direction-context/DirectionContext.mjs
init_react();
var DirectionContext = /* @__PURE__ */ createContext(void 0);
if (false) DirectionContext.displayName = "DirectionContext";
function useDirection() {
  const context = useContext(DirectionContext);
  return context?.direction ?? "ltr";
}

// node_modules/@base-ui/react/floating-ui-react/middleware/arrow.mjs
var baseArrow = (options) => ({
  name: "arrow",
  options,
  async fn(state) {
    const {
      x,
      y,
      placement,
      rects,
      platform: platform3,
      elements,
      middlewareData
    } = state;
    const {
      element,
      padding = 0
    } = evaluate(options, state) || {};
    if (element == null) {
      return {};
    }
    const paddingObject = getPaddingObject(padding);
    const coords = {
      x,
      y
    };
    const axis = getAlignmentAxis(placement);
    const length = getAxisLength(axis);
    const arrowDimensions = await platform3.getDimensions(element);
    const isYAxis = axis === "y";
    const minProp = isYAxis ? "top" : "left";
    const maxProp = isYAxis ? "bottom" : "right";
    const clientProp = isYAxis ? "clientHeight" : "clientWidth";
    const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
    const startDiff = coords[axis] - rects.reference[axis];
    const clientSize = elements.floating[clientProp] || rects.floating[length];
    const centerToReference = endDiff / 2 - startDiff / 2;
    const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
    const minPadding = Math.min(paddingObject[minProp], largestPossiblePadding);
    const maxPadding = Math.min(paddingObject[maxProp], largestPossiblePadding);
    const min2 = minPadding;
    const max2 = clientSize - arrowDimensions[length] - maxPadding;
    const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
    const offset4 = clamp(min2, center, max2);
    const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset4 && rects.reference[length] / 2 - (center < min2 ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
    const alignmentOffset = shouldAddOffset ? center < min2 ? center - min2 : center - max2 : 0;
    return {
      [axis]: coords[axis] + alignmentOffset,
      data: {
        [axis]: offset4,
        centerOffset: center - offset4 - alignmentOffset,
        ...shouldAddOffset && {
          alignmentOffset
        }
      },
      reset: shouldAddOffset
    };
  }
});
var arrow4 = (options, deps) => {
  const {
    name,
    fn
  } = baseArrow(options);
  return {
    name,
    fn,
    options: [options, deps]
  };
};

// node_modules/@base-ui/react/utils/hideMiddleware.mjs
var hide4 = {
  name: "hide",
  async fn(state) {
    const {
      width,
      height,
      x,
      y
    } = state.rects.reference;
    const anchorHidden2 = width === 0 && height === 0 && x === 0 && y === 0;
    const overflow = await state.platform.detectOverflow(state, {
      elementContext: "reference"
    });
    const referenceHidden = overflow.top - height >= 0 || overflow.right - width >= 0 || overflow.bottom - height >= 0 || overflow.left - width >= 0;
    return {
      data: {
        referenceHidden: referenceHidden || anchorHidden2
      }
    };
  }
};

// node_modules/@base-ui/react/utils/adaptiveOriginConstants.mjs
var DEFAULT_SIDES = {
  sideX: "left",
  sideY: "top"
};

// node_modules/@base-ui/react/utils/CommonPositionerCssVars.mjs
var availableWidth = "--available-width";
var availableHeight = "--available-height";
var anchorWidth = "--anchor-width";
var anchorHeight = "--anchor-height";
var transformOrigin = "--transform-origin";
var positionerWidth = "--positioner-width";
var positionerHeight = "--positioner-height";

// node_modules/@base-ui/react/internals/useAnchorPositioning.mjs
var AVAILABLE_WIDTH_VAR = availableWidth;
var AVAILABLE_HEIGHT_VAR = availableHeight;
function getLogicalSide(sideParam, renderedSide, isRtl) {
  const isLogicalSideParam = sideParam === "inline-start" || sideParam === "inline-end";
  const logicalRight = isRtl ? "inline-start" : "inline-end";
  const logicalLeft = isRtl ? "inline-end" : "inline-start";
  return {
    top: "top",
    right: isLogicalSideParam ? logicalRight : "right",
    bottom: "bottom",
    left: isLogicalSideParam ? logicalLeft : "left"
  }[renderedSide];
}
function getOffsetData(state, sideParam, isRtl) {
  const {
    rects,
    placement
  } = state;
  const data = {
    side: getLogicalSide(sideParam, getSide(placement), isRtl),
    align: getAlignment(placement) || "center",
    anchor: {
      width: rects.reference.width,
      height: rects.reference.height
    },
    positioner: {
      width: rects.floating.width,
      height: rects.floating.height
    }
  };
  return data;
}
function useAnchorPositioning(params) {
  return useAnchorPositioningWithHook(params, useBaseUIFloating);
}
function useAnchorPositioningWithHook(params, useFloatingHook) {
  const {
    // Public parameters
    anchor,
    positionMethod = "absolute",
    side: sideParam = "bottom",
    sideOffset = 0,
    align = "center",
    alignOffset = 0,
    collisionBoundary,
    collisionPadding: collisionPaddingParam = 5,
    sticky = false,
    arrowPadding = 5,
    disableAnchorTracking = false,
    inline: inlineMiddleware,
    // Private parameters
    keepMounted = false,
    floatingRootContext,
    mounted,
    collisionAvoidance,
    shift: shift4,
    nodeId,
    adaptiveOrigin: adaptiveOrigin2,
    lazyFlip = false,
    externalTree
  } = params;
  const collisionAvoidanceSide = collisionAvoidance.side || "flip";
  const collisionAvoidanceAlign = collisionAvoidance.align || "flip";
  const collisionAvoidanceFallbackAxisSide = collisionAvoidance.fallbackAxisSide || "end";
  const shiftCrossAxis = shift4?.crossAxis ?? false;
  const shiftRootBoundary = shift4?.rootBoundary;
  const anchorFn = typeof anchor === "function" ? anchor : void 0;
  const anchorFnCallback = useStableCallback(anchorFn);
  const anchorDep = anchorFn ? anchorFnCallback : anchor;
  const anchorValueRef = useValueAsRef(anchor);
  const mountedRef = useValueAsRef(mounted);
  const direction = useDirection();
  const isRtl = direction === "rtl";
  const [mountPlacement, setMountPlacement] = useState(null);
  if (!mounted && mountPlacement !== null) {
    setMountPlacement(null);
  }
  const lockAlign = lazyFlip === "placement";
  const mountSide = mountPlacement ? getSide(mountPlacement) : null;
  const mountAlign = mountPlacement && lockAlign ? getAlignment(mountPlacement) || "center" : null;
  const side = mountSide || {
    top: "top",
    right: "right",
    bottom: "bottom",
    left: "left",
    "inline-end": isRtl ? "left" : "right",
    "inline-start": isRtl ? "right" : "left"
  }[sideParam];
  const placementAlign = mountAlign || align;
  const placement = placementAlign === "center" ? side : `${side}-${placementAlign}`;
  let collisionPadding = collisionPaddingParam;
  if (typeof collisionPadding === "number") {
    collisionPadding = {
      top: collisionPadding,
      right: collisionPadding,
      bottom: collisionPadding,
      left: collisionPadding
    };
  } else if (collisionPadding) {
    collisionPadding = {
      top: collisionPadding.top || 0,
      right: collisionPadding.right || 0,
      bottom: collisionPadding.bottom || 0,
      left: collisionPadding.left || 0
    };
  }
  const bias = 1;
  const biasTop = sideParam === "bottom" ? bias : 0;
  const biasBottom = sideParam === "top" ? bias : 0;
  const biasLeft = sideParam === "right" ? bias : 0;
  const biasRight = sideParam === "left" ? bias : 0;
  const commonCollisionProps = {
    boundary: collisionBoundary === "clipping-ancestors" ? "clippingAncestors" : collisionBoundary,
    padding: collisionPadding
  };
  const arrowRef = useRef(null);
  const sideOffsetRef = useValueAsRef(sideOffset);
  const alignOffsetRef = useValueAsRef(alignOffset);
  const sideOffsetDep = typeof sideOffset !== "function" ? sideOffset : 0;
  const alignOffsetDep = typeof alignOffset !== "function" ? alignOffset : 0;
  const middleware = [];
  if (inlineMiddleware) {
    middleware.push(inlineMiddleware);
  }
  middleware.push(offset3((state) => {
    const data = getOffsetData(state, sideParam, isRtl);
    const sideAxis = typeof sideOffsetRef.current === "function" ? sideOffsetRef.current(data) : sideOffsetRef.current;
    const alignAxis = typeof alignOffsetRef.current === "function" ? alignOffsetRef.current(data) : alignOffsetRef.current;
    return {
      mainAxis: sideAxis,
      crossAxis: alignAxis,
      alignmentAxis: alignAxis
    };
  }, [sideOffsetDep, alignOffsetDep, isRtl, sideParam]));
  const shiftDisabled = collisionAvoidanceAlign === "none" && collisionAvoidanceSide !== "shift";
  const crossAxisShiftEnabled = !shiftDisabled && (sticky || shiftCrossAxis || collisionAvoidanceSide === "shift");
  const flipMiddleware = collisionAvoidanceSide === "none" ? null : flip3({
    ...commonCollisionProps,
    // Ensure the popup flips if it's been limited by its --available-height and it resizes.
    // Since the size() padding is smaller than the flip() padding, flip() will take precedence.
    padding: {
      top: collisionPadding.top + bias + biasTop,
      right: collisionPadding.right + bias + biasRight,
      bottom: collisionPadding.bottom + bias + biasBottom,
      left: collisionPadding.left + bias + biasLeft
    },
    mainAxis: !shiftCrossAxis && collisionAvoidanceSide === "flip",
    crossAxis: collisionAvoidanceAlign === "flip" ? "alignment" : false,
    fallbackAxisSideDirection: collisionAvoidanceFallbackAxisSide
  });
  const shiftMiddleware = shiftDisabled ? null : shift3({
    ...commonCollisionProps,
    // Use the Layout Viewport to avoid shifting around when pinch-zooming.
    rootBoundary: shiftRootBoundary,
    mainAxis: collisionAvoidanceAlign !== "none",
    crossAxis: crossAxisShiftEnabled,
    limiter: sticky || shiftCrossAxis ? void 0 : limitShift3((limitData) => {
      if (!arrowRef.current) {
        return {};
      }
      const {
        width,
        height
      } = arrowRef.current.getBoundingClientRect();
      const sideAxis = getSideAxis(getSide(limitData.placement));
      const arrowSize = sideAxis === "y" ? width : height;
      const offsetAmount = sideAxis === "y" ? collisionPadding.left + collisionPadding.right : collisionPadding.top + collisionPadding.bottom;
      return {
        offset: arrowSize / 2 + offsetAmount / 2
      };
    })
  }, [commonCollisionProps, sticky, shiftCrossAxis, shiftRootBoundary, collisionPadding, collisionAvoidanceAlign]);
  if (collisionAvoidanceSide === "shift" || collisionAvoidanceAlign === "shift" || placementAlign === "center") {
    middleware.push(shiftMiddleware, flipMiddleware);
  } else {
    middleware.push(flipMiddleware, shiftMiddleware);
  }
  middleware.push(size3({
    ...commonCollisionProps,
    apply({
      elements: {
        floating
      },
      availableWidth: availableWidth2,
      availableHeight: availableHeight2,
      rects
    }) {
      if (!mountedRef.current) {
        return;
      }
      const floatingStyle = floating.style;
      floatingStyle.setProperty(AVAILABLE_WIDTH_VAR, `${availableWidth2}px`);
      floatingStyle.setProperty(AVAILABLE_HEIGHT_VAR, `${availableHeight2}px`);
      const dpr = getWindow(floating).devicePixelRatio || 1;
      const {
        x: x2,
        y: y2,
        width,
        height
      } = rects.reference;
      const anchorWidth2 = (Math.round((x2 + width) * dpr) - Math.round(x2 * dpr)) / dpr;
      const anchorHeight2 = (Math.round((y2 + height) * dpr) - Math.round(y2 * dpr)) / dpr;
      floatingStyle.setProperty(anchorWidth, `${anchorWidth2}px`);
      floatingStyle.setProperty(anchorHeight, `${anchorHeight2}px`);
    }
  }), arrow4((state) => ({
    // `transform-origin` calculations rely on an element existing. If the arrow hasn't been set,
    // we'll create a fake element.
    element: arrowRef.current || ownerDocument(state.elements.floating).createElement("div"),
    // No padding for the fake arrow: it would displace aligned popups on narrow anchors.
    padding: arrowRef.current ? arrowPadding : 0
  }), [arrowPadding]), {
    name: "transformOrigin",
    fn(state) {
      const {
        elements: {
          floating
        },
        middlewareData: middlewareData2,
        placement: renderedPlacement2,
        platform: platform3,
        rects,
        y: y2
      } = state;
      const renderedSide2 = getSide(renderedPlacement2);
      const renderedAlign2 = getAlignment(renderedPlacement2);
      const isVertical = getSideAxis(renderedSide2) === "y";
      const arrowEl = arrowRef.current;
      const sideOffsetValue = typeof sideOffset === "function" ? sideOffset(getOffsetData(state, sideParam, isRtl)) : sideOffset;
      let crossOrigin;
      if (!arrowEl && renderedAlign2 && Math.abs(isVertical ? middlewareData2.shift?.x || 0 : middlewareData2.shift?.y || 0) <= 1) {
        crossOrigin = renderedAlign2 === "start" === (isVertical && platform3.isRTL?.(floating) === true) ? "100%" : "0%";
      } else {
        const arrowOffset = isVertical ? middlewareData2.arrow?.x || 0 : middlewareData2.arrow?.y || 0;
        const arrowSize = isVertical ? arrowEl?.clientWidth || 0 : arrowEl?.clientHeight || 0;
        crossOrigin = `${arrowOffset + arrowSize / 2}px`;
      }
      let sideOrigin = renderedSide2 === "top" || renderedSide2 === "left" ? `calc(100% + ${sideOffsetValue}px)` : `${-sideOffsetValue}px`;
      if (crossAxisShiftEnabled && isVertical && Math.abs(middlewareData2.shift?.y || 0) > sideOffsetValue) {
        sideOrigin = `${rects.reference.y + rects.reference.height / 2 - y2}px`;
      }
      floating.style.setProperty(transformOrigin, isVertical ? `${crossOrigin} ${sideOrigin}` : `${sideOrigin} ${crossOrigin}`);
      return {};
    }
  }, hide4, adaptiveOrigin2);
  useIsoLayoutEffect(() => {
    if (!mounted && floatingRootContext) {
      floatingRootContext.update({
        referenceElement: null,
        floatingElement: null,
        domReferenceElement: null,
        positionReference: null
      });
    }
  }, [mounted, floatingRootContext]);
  const autoUpdateOptions = useMemo(() => ({
    ancestorScroll: !disableAnchorTracking,
    elementResize: !disableAnchorTracking && typeof ResizeObserver !== "undefined",
    layoutShift: !disableAnchorTracking && typeof IntersectionObserver !== "undefined"
  }), [disableAnchorTracking]);
  const {
    refs,
    elements,
    x,
    y,
    middlewareData,
    update: update2,
    placement: renderedPlacement,
    context,
    isPositioned,
    floatingStyles: originalFloatingStyles
  } = useFloatingHook({
    rootContext: floatingRootContext,
    open: keepMounted ? mounted : void 0,
    placement,
    middleware,
    strategy: positionMethod,
    whileElementsMounted: keepMounted ? void 0 : (...args) => autoUpdate(...args, autoUpdateOptions),
    nodeId,
    externalTree
  });
  const {
    sideX,
    sideY
  } = middlewareData.adaptiveOrigin || DEFAULT_SIDES;
  const resolvedPosition = isPositioned ? positionMethod : "fixed";
  const floatingStyles = useMemo(() => {
    let base;
    if (!isPositioned) {
      base = {
        position: resolvedPosition,
        top: 0,
        left: 0
      };
    } else if (adaptiveOrigin2) {
      base = {
        position: resolvedPosition,
        [sideX]: x,
        [sideY]: y
      };
    } else {
      base = {
        ...originalFloatingStyles,
        position: resolvedPosition
      };
    }
    base[AVAILABLE_WIDTH_VAR] = "100vw";
    base[AVAILABLE_HEIGHT_VAR] = "100vh";
    if (!isPositioned) {
      base.opacity = 0;
    }
    return base;
  }, [adaptiveOrigin2, resolvedPosition, sideX, x, sideY, y, originalFloatingStyles, isPositioned]);
  const registeredPositionReferenceRef = useRef(null);
  useIsoLayoutEffect(() => {
    if (!mounted) {
      return;
    }
    const anchorValue = anchorValueRef.current;
    const resolvedAnchor = typeof anchorValue === "function" ? anchorValue() : anchorValue;
    const unwrappedElement = (isRef(resolvedAnchor) ? resolvedAnchor.current : resolvedAnchor) || null;
    const finalAnchor = unwrappedElement || null;
    if (finalAnchor !== registeredPositionReferenceRef.current) {
      refs.setPositionReference(finalAnchor);
      registeredPositionReferenceRef.current = finalAnchor;
    }
  }, [mounted, refs, anchorDep, anchorValueRef]);
  useEffect(() => {
    if (!mounted) {
      return;
    }
    const anchorValue = anchorValueRef.current;
    if (typeof anchorValue === "function") {
      return;
    }
    if (isRef(anchorValue) && anchorValue.current !== registeredPositionReferenceRef.current) {
      refs.setPositionReference(anchorValue.current);
      registeredPositionReferenceRef.current = anchorValue.current;
    }
  }, [mounted, refs, anchorDep, anchorValueRef]);
  useEffect(() => {
    if (keepMounted && mounted && elements.reference && elements.floating) {
      return autoUpdate(elements.reference, elements.floating, update2, autoUpdateOptions);
    }
    return void 0;
  }, [keepMounted, mounted, elements, update2, autoUpdateOptions]);
  const renderedSide = getSide(renderedPlacement);
  const logicalRenderedSide = getLogicalSide(sideParam, renderedSide, isRtl);
  const renderedAlign = getAlignment(renderedPlacement) || "center";
  const anchorHidden2 = Boolean(middlewareData.hide?.referenceHidden);
  useIsoLayoutEffect(() => {
    if (lazyFlip && mounted && isPositioned && (renderedSide !== side || lockAlign && renderedAlign !== placementAlign)) {
      setMountPlacement(renderedPlacement);
    }
  }, [lazyFlip, lockAlign, mounted, isPositioned, renderedPlacement, renderedSide, renderedAlign, side, placementAlign]);
  const arrowStyles = useMemo(() => ({
    position: "absolute",
    top: middlewareData.arrow?.y,
    left: middlewareData.arrow?.x
  }), [middlewareData.arrow]);
  const arrowUncentered = middlewareData.arrow?.centerOffset !== 0;
  return useMemo(() => ({
    positionerStyles: floatingStyles,
    arrowStyles,
    arrowRef,
    arrowUncentered,
    side: logicalRenderedSide,
    align: renderedAlign,
    physicalSide: renderedSide,
    anchorHidden: anchorHidden2,
    refs,
    context,
    isPositioned,
    update: update2
  }), [floatingStyles, arrowStyles, arrowRef, arrowUncentered, logicalRenderedSide, renderedAlign, renderedSide, anchorHidden2, refs, context, isPositioned, update2]);
}
function isRef(param) {
  return param != null && "current" in param;
}

// node_modules/@base-ui/react/internals/composite/list/CompositeList.mjs
init_react();
function CompositeList(props) {
  const {
    children,
    elementsRef,
    labelsRef,
    onMapChange: onMapChangeProp
  } = props;
  const onMapChange = useStableCallback(onMapChangeProp);
  const [, setMapTick] = useState(0);
  const listeners = useRefWithInit(createListeners).current;
  const map = useRefWithInit(createMap).current;
  const nextIndexRef = useRef(0);
  const isDirtyRef = useRef(true);
  const itemsRef = useRef(null);
  const mutationObserverRef = useRef(null);
  const scheduleMapUpdate = useStableCallback(() => {
    if (isDirtyRef.current) {
      return;
    }
    isDirtyRef.current = true;
    setMapTick((tick) => tick + 1);
  });
  const register2 = useStableCallback((node, registration) => {
    map.set(node, registration);
    scheduleMapUpdate();
  });
  const unregister = useStableCallback((node) => {
    map.delete(node);
    scheduleMapUpdate();
  });
  const syncRefs = useStableCallback((items) => {
    const nextMap = /* @__PURE__ */ new Map();
    elementsRef.current.length = 0;
    if (labelsRef) {
      labelsRef.current.length = 0;
    }
    items.forEach((item) => {
      nextMap.set(item.element, {
        ...item.registration.metadata ?? {},
        index: item.index
      });
      elementsRef.current[item.index] = item.element;
      if (labelsRef) {
        labelsRef.current[item.index] = item.registration.label !== void 0 ? item.registration.label : item.registration.textRef?.current?.textContent ?? item.element.textContent;
      }
    });
    nextIndexRef.current = elementsRef.current.length;
    return nextMap;
  });
  function observe(sortedNodes) {
    mutationObserverRef.current?.disconnect();
    mutationObserverRef.current = null;
    if (typeof MutationObserver !== "function" || sortedNodes.length < 2) {
      return;
    }
    const mutationObserver = new MutationObserver((entries) => {
      if (!hasMovedNode(entries)) {
        return;
      }
      let previousConnectedNode = null;
      for (const node of sortedNodes) {
        if (!node.isConnected) {
          continue;
        }
        if (previousConnectedNode && sortByDocumentPosition(previousConnectedNode, node) > 0) {
          mutationObserver.disconnect();
          scheduleMapUpdate();
          return;
        }
        previousConnectedNode = node;
      }
    });
    mutationObserverRef.current = mutationObserver;
    const roots = /* @__PURE__ */ new Set();
    for (let i = 1; i < sortedNodes.length; i += 1) {
      const root = getCommonAncestor(sortedNodes[i - 1], sortedNodes[i]);
      if (root) {
        roots.add(root);
      }
    }
    roots.forEach((root) => mutationObserver.observe(root, {
      childList: true
    }));
  }
  const flush = useStableCallback(() => {
    const [items, automaticNodes] = getCompositeListSnapshot(map);
    const nextMap = syncRefs(items);
    const previousItems = itemsRef.current;
    const changed = !previousItems || previousItems.length !== items.length || items.some((item, index2) => {
      const previousItem = previousItems[index2];
      return item.index !== previousItem.index || item.element !== previousItem.element || item.registration.index !== previousItem.registration.index || item.registration.metadata !== previousItem.registration.metadata;
    });
    observe(automaticNodes);
    itemsRef.current = items;
    isDirtyRef.current = false;
    if (!changed) {
      return;
    }
    listeners.forEach((listener) => listener(nextMap));
    onMapChange(nextMap);
  });
  useIsoLayoutEffect(() => {
    if (!isDirtyRef.current && itemsRef.current) {
      syncRefs(itemsRef.current);
    }
    return () => {
      elementsRef.current = [];
      if (labelsRef) {
        labelsRef.current = [];
      }
    };
  }, [elementsRef, labelsRef, syncRefs]);
  useIsoLayoutEffect(() => {
    if (isDirtyRef.current) {
      flush();
    }
  });
  useIsoLayoutEffect(() => {
    return () => {
      mutationObserverRef.current?.disconnect();
      isDirtyRef.current = true;
    };
  }, []);
  const subscribeMapChange = useStableCallback((fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  });
  const contextValue = useMemo(() => ({
    register: register2,
    unregister,
    subscribeMapChange,
    nextIndexRef
  }), [register2, unregister, subscribeMapChange, nextIndexRef]);
  return /* @__PURE__ */ jsx(CompositeListContext.Provider, {
    value: contextValue,
    children
  });
}
function createMap() {
  return /* @__PURE__ */ new Map();
}
function createListeners() {
  return /* @__PURE__ */ new Set();
}
function getCompositeListSnapshot(map) {
  const reservedIndices = /* @__PURE__ */ new Set();
  const items = [];
  const automaticItems = [];
  map.forEach((registration, node) => {
    if (!node.isConnected) {
      return;
    }
    const index2 = registration.index;
    const item = {
      index: index2 ?? -1,
      element: node,
      registration
    };
    if (index2 === null) {
      automaticItems.push(item);
    } else if (index2 >= 0) {
      reservedIndices.add(index2);
      items.push(item);
    }
  });
  let nextAutomaticIndex = 0;
  automaticItems.sort((a, b) => sortByDocumentPosition(a.element, b.element));
  automaticItems.forEach((item) => {
    while (reservedIndices.has(nextAutomaticIndex)) {
      nextAutomaticIndex += 1;
    }
    item.index = nextAutomaticIndex;
    items.push(item);
    nextAutomaticIndex += 1;
  });
  if (reservedIndices.size > 0) {
    items.sort((a, b) => a.index - b.index);
  }
  return [items, automaticItems.map((item) => item.element)];
}
function getCommonAncestor(firstNode, lastNode) {
  let ancestor = firstNode.parentElement;
  while (ancestor && !ancestor.contains(lastNode)) {
    ancestor = ancestor.parentElement;
  }
  return ancestor;
}
function hasMovedNode(entries) {
  for (const entry of entries) {
    for (let i = 0; i < entry.removedNodes.length; i += 1) {
      if (entry.removedNodes[i].isConnected) {
        return true;
      }
    }
  }
  return false;
}
function sortByDocumentPosition(a, b) {
  if (a.nextElementSibling === b) {
    return -1;
  }
  if (b.nextElementSibling === a) {
    return 1;
  }
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

// node_modules/@base-ui/react/utils/InternalBackdrop.mjs
init_react();
var InternalBackdrop = /* @__PURE__ */ forwardRef(function InternalBackdrop2(props, ref) {
  const {
    cutout,
    ...otherProps
  } = props;
  let clipPath;
  if (cutout) {
    const rect = cutout.getBoundingClientRect();
    clipPath = `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${rect.left}px ${rect.top}px,${rect.left}px ${rect.bottom}px,${rect.right}px ${rect.bottom}px,${rect.right}px ${rect.top}px,${rect.left}px ${rect.top}px)`;
  }
  return /* @__PURE__ */ jsx("div", {
    ref,
    role: "presentation",
    "data-base-ui-inert": "",
    ...otherProps,
    style: {
      position: "fixed",
      inset: 0,
      userSelect: "none",
      WebkitUserSelect: "none",
      clipPath
    }
  });
});
if (false) InternalBackdrop.displayName = "InternalBackdrop";

// node_modules/@base-ui/react/internals/useTriggerSwitchTransition.mjs
init_react();
function useTriggerSwitchTransition(parameters) {
  const {
    store,
    domReference,
    positionerElement,
    open: open2
  } = parameters;
  const previousTriggerRef = useRef(null);
  const pendingSwitchRef = useRef(null);
  const runOnceAnimationsFinish = useAnimationsFinished(positionerElement);
  useIsoLayoutEffect(() => {
    if (open2) {
      return;
    }
    pendingSwitchRef.current?.abort();
    pendingSwitchRef.current = null;
    if (store.state.instantType === "trigger-change") {
      store.set("instantType", void 0);
    }
  }, [open2, store]);
  useIsoLayoutEffect(() => {
    const currentTrigger = domReference;
    const previousTrigger = previousTriggerRef.current;
    if (currentTrigger) {
      previousTriggerRef.current = currentTrigger;
    }
    if (!previousTrigger || !currentTrigger || currentTrigger === previousTrigger) {
      return void 0;
    }
    if (!store.select("open")) {
      return void 0;
    }
    store.set("instantType", void 0);
    const abortController = new AbortController();
    pendingSwitchRef.current = abortController;
    runOnceAnimationsFinish(() => {
      if (store.select("open")) {
        store.set("instantType", "trigger-change");
      }
    }, abortController.signal);
    return () => {
      abortController.abort();
    };
  }, [domReference, runOnceAnimationsFinish, store]);
}

// node_modules/@base-ui/react/utils/usePositioner.mjs
function usePositioner(componentProps, state, {
  styles,
  transitionStatus,
  props,
  refs,
  hidden,
  inert = false
}) {
  const style = {
    ...styles
  };
  if (inert) {
    style.pointerEvents = "none";
  }
  return useRenderElement("div", componentProps, {
    state,
    ref: refs,
    props: [{
      role: "presentation",
      hidden,
      style
    }, getDisabledMountTransitionStyles(transitionStatus), props],
    stateAttributesMapping: popupStateMapping
  });
}

// node_modules/@base-ui/react/utils/useAnchoredPopupScrollLock.mjs
init_react();

// node_modules/@base-ui/utils/useScrollLock.mjs
var originalHtmlStyles = {};
var originalBodyStyles = {};
var originalHtmlScrollBehavior = "";
function getViewportScroller(html, body) {
  return isOverflowElement(html) ? html : body;
}
function isPageScrollLocked(win, html, body) {
  return /hidden|clip/.test(win.getComputedStyle(getViewportScroller(html, body)).overflowY);
}
function hasInsetScrollbars(referenceElement) {
  if (typeof document === "undefined") {
    return false;
  }
  const doc = ownerDocument(referenceElement);
  const win = getWindow(doc);
  return win.innerWidth - doc.documentElement.clientWidth > 0;
}
function supportsStableScrollbarGutter(referenceElement) {
  const supported = typeof CSS !== "undefined" && CSS.supports && CSS.supports("scrollbar-gutter", "stable");
  if (!supported || typeof document === "undefined") {
    return false;
  }
  const doc = ownerDocument(referenceElement);
  const html = doc.documentElement;
  const body = doc.body;
  const scrollContainer = getViewportScroller(html, body);
  const originalScrollContainerOverflowY = scrollContainer.style.overflowY;
  const originalHtmlStyleGutter = html.style.scrollbarGutter;
  html.style.scrollbarGutter = "stable";
  scrollContainer.style.overflowY = "scroll";
  const before = scrollContainer.offsetWidth;
  scrollContainer.style.overflowY = "hidden";
  const after = scrollContainer.offsetWidth;
  scrollContainer.style.overflowY = originalScrollContainerOverflowY;
  html.style.scrollbarGutter = originalHtmlStyleGutter;
  return before === after;
}
function preventScrollOverlayScrollbars(referenceElement) {
  const doc = ownerDocument(referenceElement);
  const html = doc.documentElement;
  const body = doc.body;
  const elementToLock = getViewportScroller(html, body);
  const originalElementToLockStyles = {
    overflowY: elementToLock.style.overflowY,
    overflowX: elementToLock.style.overflowX
  };
  Object.assign(elementToLock.style, {
    overflowY: "hidden",
    overflowX: "hidden"
  });
  return () => {
    Object.assign(elementToLock.style, originalElementToLockStyles);
  };
}
function preventScrollInsetScrollbars(referenceElement) {
  const doc = ownerDocument(referenceElement);
  const html = doc.documentElement;
  const body = doc.body;
  const win = getWindow(html);
  let scrollTop = 0;
  let scrollLeft = 0;
  let updateGutterOnly = false;
  const resizeFrame = AnimationFrame.create();
  if (parts_exports.engine.webkit && (win.visualViewport?.scale ?? 1) !== 1) {
    return () => {
    };
  }
  function lockScroll() {
    const htmlStyles = win.getComputedStyle(html);
    const bodyStyles = win.getComputedStyle(body);
    const htmlScrollbarGutterValue = htmlStyles.scrollbarGutter || "";
    const hasBothEdges = htmlScrollbarGutterValue.includes("both-edges");
    const scrollbarGutterValue = hasBothEdges ? "stable both-edges" : "stable";
    scrollTop = html.scrollTop;
    scrollLeft = html.scrollLeft;
    originalHtmlStyles = {
      scrollbarGutter: html.style.scrollbarGutter,
      overflowY: html.style.overflowY,
      overflowX: html.style.overflowX
    };
    originalHtmlScrollBehavior = html.style.scrollBehavior;
    originalBodyStyles = {
      position: body.style.position,
      height: body.style.height,
      width: body.style.width,
      boxSizing: body.style.boxSizing,
      overflowY: body.style.overflowY,
      overflowX: body.style.overflowX,
      scrollBehavior: body.style.scrollBehavior
    };
    const isScrollableY = html.scrollHeight > html.clientHeight;
    const isScrollableX = html.scrollWidth > html.clientWidth;
    const hasConstantOverflowY = htmlStyles.overflowY === "scroll" || bodyStyles.overflowY === "scroll";
    const hasConstantOverflowX = htmlStyles.overflowX === "scroll" || bodyStyles.overflowX === "scroll";
    const scrollbarWidth = Math.max(0, win.innerWidth - body.clientWidth);
    const scrollbarHeight = Math.max(0, win.innerHeight - body.clientHeight);
    const marginY = parseFloat(bodyStyles.marginTop) + parseFloat(bodyStyles.marginBottom);
    const marginX = parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight);
    const elementToLock = getViewportScroller(html, body);
    updateGutterOnly = supportsStableScrollbarGutter(referenceElement);
    if (updateGutterOnly) {
      html.style.scrollbarGutter = scrollbarGutterValue;
      elementToLock.style.overflowY = "hidden";
      elementToLock.style.overflowX = "hidden";
      return;
    }
    Object.assign(html.style, {
      scrollbarGutter: scrollbarGutterValue,
      overflowY: "hidden",
      overflowX: "hidden"
    });
    if (isScrollableY || hasConstantOverflowY) {
      html.style.overflowY = "scroll";
    }
    if (isScrollableX || hasConstantOverflowX) {
      html.style.overflowX = "scroll";
    }
    Object.assign(body.style, {
      position: "relative",
      height: marginY || scrollbarHeight ? `calc(100dvh - ${marginY + scrollbarHeight}px)` : "100dvh",
      width: marginX || scrollbarWidth ? `calc(100vw - ${marginX + scrollbarWidth}px)` : "100vw",
      boxSizing: "border-box",
      // Assign the longhands that `cleanup` restores, so nothing is left behind.
      overflowY: "hidden",
      overflowX: "hidden",
      scrollBehavior: "unset"
    });
    body.scrollTop = scrollTop;
    body.scrollLeft = scrollLeft;
    html.setAttribute("data-base-ui-scroll-locked", "");
    html.style.scrollBehavior = "unset";
  }
  function cleanup() {
    Object.assign(html.style, originalHtmlStyles);
    Object.assign(body.style, originalBodyStyles);
    if (!updateGutterOnly) {
      html.scrollTop = scrollTop;
      html.scrollLeft = scrollLeft;
      html.removeAttribute("data-base-ui-scroll-locked");
      html.style.scrollBehavior = originalHtmlScrollBehavior;
    }
  }
  function handleResize() {
    cleanup();
    resizeFrame.request(lockScroll);
  }
  lockScroll();
  const unsubscribeResize = addEventListener(win, "resize", handleResize);
  return () => {
    resizeFrame.cancel();
    cleanup();
    if (typeof win.removeEventListener === "function") {
      unsubscribeResize();
    }
  };
}
var ScrollLocker = class {
  lockCount = 0;
  restore = null;
  timeoutLock = Timeout.create();
  timeoutUnlock = Timeout.create();
  acquire(referenceElement) {
    this.lockCount += 1;
    if (this.lockCount === 1 && this.restore === null) {
      this.timeoutLock.start(0, () => this.lock(referenceElement));
    }
    return this.release;
  }
  release = () => {
    this.lockCount -= 1;
    if (this.lockCount === 0 && this.restore) {
      this.timeoutUnlock.start(0, this.unlock);
    }
  };
  unlock = () => {
    if (this.lockCount === 0 && this.restore) {
      this.restore?.();
      this.restore = null;
    }
  };
  lock(referenceElement) {
    if (this.lockCount === 0 || this.restore !== null) {
      return;
    }
    const doc = ownerDocument(referenceElement);
    const html = doc.documentElement;
    const body = doc.body;
    const win = getWindow(html);
    if (isPageScrollLocked(win, html, body)) {
      const observer = new win.MutationObserver(() => {
        if (isPageScrollLocked(win, html, body)) {
          return;
        }
        observer.disconnect();
        this.restore = null;
        this.lock(referenceElement);
      });
      const options = {
        attributes: true
      };
      observer.observe(html, options);
      observer.observe(body, options);
      this.restore = () => observer.disconnect();
      return;
    }
    const hasOverlayScrollbars = parts_exports.os.ios || !hasInsetScrollbars(referenceElement);
    this.restore = hasOverlayScrollbars ? preventScrollOverlayScrollbars(referenceElement) : preventScrollInsetScrollbars(referenceElement);
  }
};
var SCROLL_LOCKER = new ScrollLocker();
function useScrollLock(enabled = true, referenceElement = null) {
  useIsoLayoutEffect(() => {
    if (!enabled) {
      return void 0;
    }
    return SCROLL_LOCKER.acquire(referenceElement);
  }, [enabled, referenceElement]);
}

// node_modules/@base-ui/react/utils/useAnchoredPopupScrollLock.mjs
var VIEWPORT_WIDTH_TOLERANCE_PX = 20;
function useAnchoredPopupScrollLock(enabled, touchOpen, positionerElement, referenceElement) {
  const [touchOpenShouldLockScroll, setTouchOpenShouldLockScroll] = useState(false);
  useIsoLayoutEffect(() => {
    if (!enabled || !touchOpen || positionerElement == null) {
      setTouchOpenShouldLockScroll(false);
      return;
    }
    const viewportWidth = ownerDocument(positionerElement).documentElement.clientWidth;
    const popupWidth2 = positionerElement.offsetWidth;
    setTouchOpenShouldLockScroll(viewportWidth > 0 && popupWidth2 > 0 && popupWidth2 >= viewportWidth - VIEWPORT_WIDTH_TOLERANCE_PX);
  }, [enabled, touchOpen, positionerElement]);
  useScrollLock(enabled && (!touchOpen || touchOpenShouldLockScroll), referenceElement);
}

// node_modules/@base-ui/react/menu/positioner/MenuPositioner.mjs
var MenuPositioner = /* @__PURE__ */ forwardRef(function MenuPositioner2(componentProps, forwardedRef) {
  const {
    anchor: anchorProp,
    positionMethod: positionMethodProp = "absolute",
    className,
    render,
    side,
    align: alignProp,
    sideOffset: sideOffsetProp = 0,
    alignOffset: alignOffsetProp = 0,
    collisionBoundary = "clipping-ancestors",
    collisionPadding = 5,
    arrowPadding = 5,
    sticky = false,
    disableAnchorTracking = false,
    collisionAvoidance: collisionAvoidanceProp = DROPDOWN_COLLISION_AVOIDANCE,
    style,
    ...elementProps
  } = componentProps;
  const {
    store,
    virtualFocus,
    syncHighlightedItem
  } = useMenuRootContext();
  const keepMounted = useMenuPortalContext();
  const contextMenuContext = useContextMenuRootContext(true);
  const parent = store.useState("parent");
  const floatingRootContext = store.useState("floatingRootContext");
  const floatingTreeRoot = store.useState("floatingTreeRoot");
  const mounted = store.useState("mounted");
  const open2 = store.useState("open");
  const modal = store.useState("modal");
  const openMethod = store.useState("openMethod");
  const triggerElement = store.useState("activeTriggerElement");
  const transitionStatus = store.useState("transitionStatus");
  const positionerElement = store.useState("positionerElement");
  const instantType = store.useState("instantType");
  const adaptiveOrigin2 = store.useState("adaptiveOrigin");
  const lastOpenChangeReason = store.useState("lastOpenChangeReason");
  const floatingNodeId = store.useState("floatingNodeId");
  const floatingParentNodeId = store.useState("floatingParentNodeId");
  const domReference = floatingRootContext.useState("domReferenceElement");
  let anchor = anchorProp;
  let sideOffset = sideOffsetProp;
  let alignOffset = alignOffsetProp;
  let align = alignProp;
  let collisionAvoidance = collisionAvoidanceProp;
  if (parent.type === "context-menu") {
    anchor = anchorProp ?? parent.context?.anchor;
    align = align ?? "start";
    if (!side && align !== "center") {
      alignOffset = componentProps.alignOffset ?? 2;
      sideOffset = componentProps.sideOffset ?? -5;
    }
  }
  let computedSide = side;
  let computedAlign = align;
  if (parent.type === "menu") {
    computedSide = computedSide ?? "inline-end";
    computedAlign = computedAlign ?? "start";
    collisionAvoidance = componentProps.collisionAvoidance ?? POPUP_COLLISION_AVOIDANCE;
  } else if (parent.type === "menubar") {
    computedSide = computedSide ?? (parent.context.orientation === "vertical" ? "inline-end" : "bottom");
    computedAlign = computedAlign ?? "start";
  }
  const contextMenu = parent.type === "context-menu";
  const positioner = useAnchorPositioning({
    anchor,
    floatingRootContext,
    positionMethod: contextMenuContext ? "fixed" : positionMethodProp,
    mounted,
    side: computedSide,
    sideOffset,
    align: computedAlign,
    alignOffset,
    arrowPadding: contextMenu ? 0 : arrowPadding,
    collisionBoundary,
    collisionPadding,
    sticky,
    nodeId: floatingNodeId,
    keepMounted,
    disableAnchorTracking,
    collisionAvoidance,
    shift: contextMenu ? {
      crossAxis: !("side" in collisionAvoidance && collisionAvoidance.side === "flip"),
      rootBoundary: "layoutViewport"
    } : void 0,
    externalTree: floatingTreeRoot,
    adaptiveOrigin: adaptiveOrigin2,
    lazyFlip: virtualFocus ? "placement" : false
  });
  useEffect(() => {
    function onMenuOpenChange(details) {
      if (details.open) {
        if (details.parentNodeId === floatingNodeId) {
          store.set("hoverEnabled", false);
        }
        if (details.nodeId !== floatingNodeId && details.parentNodeId === store.select("floatingParentNodeId")) {
          store.setOpen(false, createChangeEventDetails(reason_parts_exports.siblingOpen));
        }
      }
    }
    floatingTreeRoot.events.on("menuopenchange", onMenuOpenChange);
    return () => {
      floatingTreeRoot.events.off("menuopenchange", onMenuOpenChange);
    };
  }, [store, floatingTreeRoot.events, floatingNodeId]);
  useEffect(() => {
    if (store.select("floatingParentNodeId") == null) {
      return void 0;
    }
    function onParentClose(details) {
      if (details.open || details.nodeId !== store.select("floatingParentNodeId")) {
        return;
      }
      const reason = details.reason ?? reason_parts_exports.siblingOpen;
      store.setOpen(false, createChangeEventDetails(reason));
    }
    floatingTreeRoot.events.on("menuopenchange", onParentClose);
    return () => {
      floatingTreeRoot.events.off("menuopenchange", onParentClose);
    };
  }, [floatingTreeRoot.events, store]);
  const closeTimeout = useTimeout();
  useEffect(() => {
    if (!open2) {
      closeTimeout.clear();
    }
  }, [open2, closeTimeout]);
  useEffect(() => {
    function onItemHover(event) {
      if (!open2 || event.nodeId !== store.select("floatingParentNodeId")) {
        return;
      }
      if (event.target && triggerElement && triggerElement !== event.target) {
        const delay = store.select("closeDelay");
        if (delay > 0) {
          if (!closeTimeout.isStarted()) {
            closeTimeout.start(delay, () => {
              store.setOpen(false, createChangeEventDetails(reason_parts_exports.siblingOpen));
            });
          }
        } else {
          store.setOpen(false, createChangeEventDetails(reason_parts_exports.siblingOpen));
        }
      } else {
        closeTimeout.clear();
      }
    }
    floatingTreeRoot.events.on("itemhover", onItemHover);
    return () => {
      floatingTreeRoot.events.off("itemhover", onItemHover);
    };
  }, [floatingTreeRoot.events, open2, triggerElement, store, closeTimeout]);
  useEffect(() => {
    const eventDetails = {
      open: open2,
      nodeId: floatingNodeId,
      parentNodeId: floatingParentNodeId,
      reason: store.select("lastOpenChangeReason")
    };
    floatingTreeRoot.events.emit("menuopenchange", eventDetails);
  }, [floatingTreeRoot.events, open2, store, floatingNodeId, floatingParentNodeId]);
  useTriggerSwitchTransition({
    store,
    domReference,
    positionerElement,
    open: open2
  });
  const state = {
    open: open2,
    side: positioner.side,
    align: positioner.align,
    anchorHidden: positioner.anchorHidden,
    nested: parent.type === "menu",
    instant: instantType
  };
  const menubarModal = parent.type === "menubar" && parent.context.modal;
  const popupModal = modal && lastOpenChangeReason !== reason_parts_exports.triggerHover;
  useAnchoredPopupScrollLock(open2 && (menubarModal || popupModal), openMethod === "touch", positionerElement, triggerElement);
  const element = usePositioner(componentProps, state, {
    styles: positioner.positionerStyles,
    transitionStatus,
    props: elementProps,
    refs: [forwardedRef, store.useStateSetter("positionerElement")],
    hidden: !mounted,
    inert: !open2
  });
  const shouldRenderBackdrop = mounted && parent.type !== "menu" && (parent.type !== "menubar" && modal && lastOpenChangeReason !== reason_parts_exports.triggerHover || parent.type === "menubar" && parent.context.modal);
  let backdropCutout = null;
  if (parent.type === "menubar") {
    backdropCutout = parent.context.contentElement;
  } else if (parent.type === void 0) {
    backdropCutout = triggerElement;
  }
  return /* @__PURE__ */ jsxs(MenuPositionerContext.Provider, {
    value: positioner,
    children: [shouldRenderBackdrop && /* @__PURE__ */ jsx(InternalBackdrop, {
      ref: parent.type === "context-menu" || parent.type === "nested-context-menu" ? parent.context.internalBackdropRef : null,
      inert: inertValue(!open2),
      cutout: backdropCutout
    }), /* @__PURE__ */ jsx(FloatingNode, {
      id: floatingNodeId,
      children: /* @__PURE__ */ jsx(CompositeList, {
        elementsRef: store.context.itemDomElements,
        labelsRef: store.context.itemLabels,
        onMapChange: syncHighlightedItem,
        children: element
      })
    })]
  });
});
if (false) MenuPositioner.displayName = "MenuPositioner";

// node_modules/@base-ui/react/menu/radio-group/MenuRadioGroup.mjs
init_react();

// node_modules/@base-ui/react/menu/radio-group/MenuRadioGroupContext.mjs
init_react();
var MenuRadioGroupContext = /* @__PURE__ */ createContext(void 0);
if (false) MenuRadioGroupContext.displayName = "MenuRadioGroupContext";
function useMenuRadioGroupContext() {
  const context = useContext(MenuRadioGroupContext);
  if (context === void 0) {
    throw new Error(false ? "Base UI: MenuRadioGroupContext is missing. MenuRadioGroup parts must be placed within <Menu.RadioGroup>." : formatErrorMessage_default(34));
  }
  return context;
}

// node_modules/@base-ui/react/menu/radio-group/MenuRadioGroup.mjs
var MenuRadioGroupPlain = /* @__PURE__ */ forwardRef(function MenuRadioGroupPlain2(componentProps, forwardedRef) {
  const {
    render,
    className,
    value: valueProp,
    defaultValue,
    onValueChange: onValueChangeProp,
    disabled: disabled2 = false,
    style,
    "aria-labelledby": ariaLabelledByProp,
    ...elementProps
  } = componentProps;
  const [labelId, setLabelId] = useState(void 0);
  const [value, setValueUnwrapped] = useControlled({
    controlled: valueProp,
    default: defaultValue,
    name: "MenuRadioGroup"
  });
  const setValue = useStableCallback((newValue, eventDetails) => {
    onValueChangeProp?.(newValue, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    setValueUnwrapped(newValue);
  });
  const state = {
    disabled: disabled2
  };
  const element = useRenderElement("div", componentProps, {
    state,
    ref: forwardedRef,
    props: {
      role: "group",
      "aria-labelledby": ariaLabelledByProp ?? labelId,
      "aria-disabled": disabled2 || void 0,
      ...elementProps
    }
  });
  const context = useMemo(() => ({
    value,
    setValue,
    disabled: disabled2
  }), [value, setValue, disabled2]);
  return /* @__PURE__ */ jsx(MenuGroupContext.Provider, {
    value: setLabelId,
    children: /* @__PURE__ */ jsx(MenuRadioGroupContext.Provider, {
      value: context,
      children: element
    })
  });
});
if (false) MenuRadioGroupPlain.displayName = "MenuRadioGroupPlain";
var MenuRadioGroup = /* @__PURE__ */ memo(/* @__PURE__ */ forwardRef(function MenuRadioGroup2(props, forwardedRef) {
  const RadioGroup3 = useMenuFilterImpl()?.RadioGroup ?? MenuRadioGroupPlain;
  return /* @__PURE__ */ jsx(RadioGroup3, {
    ...props,
    ref: forwardedRef
  });
}));
if (false) MenuRadioGroup.displayName = "MenuRadioGroup";

// node_modules/@base-ui/react/menu/radio-item/MenuRadioItem.mjs
init_react();

// node_modules/@base-ui/react/menu/radio-item/MenuRadioItemContext.mjs
init_react();
var MenuRadioItemContext = /* @__PURE__ */ createContext(void 0);
if (false) MenuRadioItemContext.displayName = "MenuRadioItemContext";
function useMenuRadioItemContext() {
  const context = useContext(MenuRadioItemContext);
  if (context === void 0) {
    throw new Error(false ? "Base UI: MenuRadioItemContext is missing. MenuRadioItem parts must be placed within <Menu.RadioItem>." : formatErrorMessage_default(35));
  }
  return context;
}

// node_modules/@base-ui/react/menu/radio-item/MenuRadioItem.mjs
var MenuRadioItemPlain = /* @__PURE__ */ forwardRef(function MenuRadioItemPlain2(componentProps, forwardedRef) {
  const {
    render,
    className,
    id: idProp,
    label,
    nativeButton = false,
    disabled: disabledProp = false,
    closeOnClick = false,
    value,
    style,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useMenuRootContext();
  const {
    value: selectedValue,
    setValue: setSelectedValue,
    disabled: groupDisabled
  } = useMenuRadioGroupContext();
  const listItem = useCompositeListItem({
    guess: true,
    label
  });
  const id = useBaseUiId(idProp);
  const highlighted = store.useState("isActive", listItem.index);
  const nodeId = store.useState("floatingNodeId");
  const itemProps = store.useState("itemProps");
  const rootDisabled = store.useState("disabled");
  const disabled2 = disabledProp || groupDisabled || rootDisabled;
  const checked4 = selectedValue === value;
  const {
    getItemProps,
    itemRef
  } = useMenuItem({
    closeOnClick,
    disabled: disabled2,
    highlighted,
    id,
    store,
    nativeButton,
    nodeId,
    itemMetadata: REGULAR_ITEM
  });
  const state = useMemo(() => ({
    disabled: disabled2,
    highlighted,
    checked: checked4
  }), [disabled2, highlighted, checked4]);
  function handleClick(event) {
    const details = createChangeEventDetails(reason_parts_exports.itemPress, event.nativeEvent, void 0, {
      preventUnmountOnClose: NOOP
    });
    setSelectedValue(value, details);
  }
  const element = useRenderElement("div", componentProps, {
    state,
    stateAttributesMapping: itemMapping,
    props: [itemProps, {
      role: "menuitemradio",
      "aria-checked": checked4,
      onClick: handleClick
    }, elementProps, getItemProps],
    ref: [itemRef, forwardedRef, listItem.ref]
  });
  return /* @__PURE__ */ jsx(MenuRadioItemContext.Provider, {
    value: state,
    children: element
  });
});
if (false) MenuRadioItemPlain.displayName = "MenuRadioItemPlain";
var MenuRadioItem = /* @__PURE__ */ forwardRef(function MenuRadioItem2(props, forwardedRef) {
  const filterItem = useMenuFilterItem(props, forwardedRef);
  if (!filterItem.visible) {
    return null;
  }
  return /* @__PURE__ */ jsx(MenuRadioItemPlain, {
    ...props,
    ref: filterItem.ref
  });
});
if (false) MenuRadioItem.displayName = "MenuRadioItem";

// node_modules/@base-ui/react/menu/radio-item-indicator/MenuRadioItemIndicator.mjs
init_react();
var MenuRadioItemIndicator = /* @__PURE__ */ forwardRef(function MenuRadioItemIndicator2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    keepMounted = false,
    ...elementProps
  } = componentProps;
  const item = useMenuRadioItemContext();
  const indicatorRef = useRef(null);
  const {
    transitionStatus,
    mounted,
    setMounted
  } = useTransitionStatus(item.checked);
  useOpenChangeComplete({
    batch: true,
    enabled: !item.checked,
    open: item.checked,
    ref: indicatorRef,
    onComplete() {
      if (!item.checked) {
        setMounted(false);
      }
    }
  });
  const state = {
    checked: item.checked,
    disabled: item.disabled,
    highlighted: item.highlighted,
    transitionStatus
  };
  const element = useRenderElement("span", componentProps, {
    state,
    stateAttributesMapping: itemMapping,
    ref: [forwardedRef, indicatorRef],
    props: {
      "aria-hidden": true,
      ...elementProps
    },
    enabled: keepMounted || mounted
  });
  return element;
});
if (false) MenuRadioItemIndicator.displayName = "MenuRadioItemIndicator";

// node_modules/@base-ui/react/menu/root/MenuRoot.mjs
init_react();

// node_modules/@base-ui/react/menubar/MenubarContext.mjs
init_react();
var MenubarContext = /* @__PURE__ */ createContext(null);
if (false) MenubarContext.displayName = "MenubarContext";
function useMenubarContext(optional) {
  const context = useContext(MenubarContext);
  if (context === null && !optional) {
    throw new Error(false ? "Base UI: MenubarContext is missing. Menubar parts must be placed within <Menubar>." : formatErrorMessage_default(5));
  }
  return context;
}

// node_modules/@base-ui/react/utils/useOpenInteractionType.mjs
init_react();

// node_modules/@base-ui/utils/useEnhancedClickHandler.mjs
init_react();
function useEnhancedClickHandler(handler) {
  const lastClickInteractionTypeRef = useRef("");
  const handlePointerDown = useCallback((event) => {
    if (event.defaultPrevented) {
      return;
    }
    lastClickInteractionTypeRef.current = event.pointerType;
    handler(event, event.pointerType);
  }, [handler]);
  const handleClick = useCallback((event) => {
    if (event.detail === 0) {
      handler(event, "keyboard");
      return;
    }
    if ("pointerType" in event) {
      handler(event, event.pointerType);
    } else {
      handler(event, lastClickInteractionTypeRef.current);
    }
    lastClickInteractionTypeRef.current = "";
  }, [handler]);
  return {
    onClick: handleClick,
    onPointerDown: handlePointerDown
  };
}

// node_modules/@base-ui/react/internals/useValueChanged.mjs
init_react();
function useValueChanged(value, onChange) {
  const valueRef = useRef(value);
  const onChangeCallback = useStableCallback(onChange);
  useIsoLayoutEffect(() => {
    if (valueRef.current !== value) {
      onChangeCallback(valueRef.current);
    }
    valueRef.current = value;
  }, [value, onChangeCallback]);
}

// node_modules/@base-ui/react/utils/useOpenInteractionType.mjs
function useOpenMethodTriggerProps(open2, setOpenMethod) {
  const handleTriggerClick = useStableCallback((_, interactionType) => {
    const isOpen = typeof open2 === "function" ? open2() : open2;
    if (!isOpen) {
      setOpenMethod(interactionType || // On iOS Safari, the hitslop around touch targets means tapping outside an element's
      // bounds does not fire `pointerdown` but does fire `mousedown`. The `interactionType`
      // will be "" in that case.
      (parts_exports.os.ios ? "touch" : ""));
    }
  });
  const {
    onClick,
    onPointerDown
  } = useEnhancedClickHandler(handleTriggerClick);
  return useMemo(() => ({
    onClick,
    onPointerDown
  }), [onClick, onPointerDown]);
}
function useOpenInteractionType(open2) {
  const [openMethod, setOpenMethod] = useState(null);
  const triggerProps = useOpenMethodTriggerProps(open2, setOpenMethod);
  useValueChanged(open2, (previousOpen) => {
    if (previousOpen && !open2) {
      setOpenMethod(null);
    }
  });
  return useMemo(() => ({
    openMethod,
    triggerProps
  }), [openMethod, triggerProps]);
}

// node_modules/@base-ui/react/utils/getHighlightReason.mjs
function getHighlightReason(event) {
  if (event == null) {
    return reason_parts_exports.none;
  }
  if (event.type.startsWith("key")) {
    return reason_parts_exports.keyboard;
  }
  if (event.type.startsWith("mouse") || event.type.startsWith("pointer")) {
    return reason_parts_exports.pointer;
  }
  return reason_parts_exports.none;
}

// node_modules/@base-ui/react/menu/store/MenuStore.mjs
init_react();

// node_modules/@base-ui/react/utils/NullStore.mjs
var NullStore = class extends ReactStore {
  // `update`/`set`/`notifyAll` funnel through `setState` in the base `Store`, so overriding
  // `setState` alone would neutralize them today. They are overridden explicitly so the store stays
  // inert even if a future base-class change stops routing a mutator through `setState`.
  setState(_newState) {
  }
  update(_changes) {
  }
  set(_key, _value) {
  }
  notifyAll() {
  }
};

// node_modules/@base-ui/react/menu/store/MenuStore.mjs
var selectors2 = {
  ...popupStoreSelectors,
  disabled: (state) => state.parent.type === "menubar" ? state.parent.context.disabled || state.disabled : state.disabled,
  modal: (state) => (state.parent.type === void 0 || state.parent.type === "context-menu") && (state.modal ?? true),
  openMethod: (state) => state.openMethod,
  keyboardOpen: (state) => state.keyboardOpen,
  allowMouseEnter: (state) => state.allowMouseEnter,
  highlightItemOnHover: (state) => state.highlightItemOnHover,
  parent: (state) => state.parent,
  rootId: (state) => {
    if (state.parent.type === "menu") {
      return state.parent.store.select("rootId");
    }
    return state.parent.type !== void 0 ? state.parent.context.rootId : state.rootId;
  },
  activeIndex: (state) => state.activeIndex,
  listElement: (state) => state.listElement,
  /** The trigger's `aria-controls`: the list when one holds the `menu` role, else the popup. */
  triggerControlsId: (state, triggerId) => {
    const popupId = popupStoreSelectors.triggerPopupId(state, triggerId);
    return popupId ? state.listElement?.id || popupId : void 0;
  },
  filterTriggerProps: (state) => state.filterTriggerProps,
  inputProps: (state) => state.inputProps,
  // `aria-selected` is invalid on `menuitem`, but Safari VoiceOver needs it for arrow-key
  // navigation. Limit it to WebKit while the input has focus so normal VoiceOver navigation
  // does not encounter the invalid attribute.
  webkitAriaSelected: (state, highlighted) => parts_exports.engine.webkit && state.inputFocused && highlighted ? true : void 0,
  highlightedItemId: (state) => state.highlightedItem?.id || void 0,
  isActive: (state, itemIndex) => state.activeIndex === itemIndex,
  hoverEnabled: (state) => state.hoverEnabled,
  // `trigger-change` describes a popup moving between triggers, which only has
  // meaning while it is open. Dropping it once closed keeps a late or stale
  // restoration from marking a closing popup instant and skipping its exit
  // transition, including on close paths that never reach `setOpen` — a
  // controlled consumer committing `open={false}` goes straight through the prop.
  instantType: (state) => state.instantType === "trigger-change" && !popupStoreSelectors.open(state) ? void 0 : state.instantType,
  lastOpenChangeReason: (state) => state.openChangeReason,
  floatingTreeRoot: (state) => {
    if (state.parent.type === "menu") {
      return state.parent.store.select("floatingTreeRoot");
    }
    return state.floatingTreeRoot;
  },
  floatingNodeId: (state) => state.floatingNodeId,
  floatingParentNodeId: (state) => state.floatingParentNodeId,
  itemProps: (state) => state.itemProps,
  closeDelay: (state) => state.closeDelay,
  adaptiveOrigin: (state) => state.adaptiveOrigin,
  keyboardEventRelay: (state) => {
    if (state.keyboardEventRelay) {
      return state.keyboardEventRelay;
    }
    if (state.parent.type === "menu") {
      return state.parent.store.select("keyboardEventRelay");
    }
    return void 0;
  }
};
var MenuStore = class extends ReactStore {
  constructor(initialState, floatingId, nested = false) {
    const triggerElements = new PopupTriggerMap();
    const state = createInitialState(triggerElements, floatingId, nested, initialState);
    super(state, createInitialContext(triggerElements), selectors2);
    void this.observe("parent", (parent) => {
      if (parent.type === "menu") {
        this.context.allowMouseUpTriggerRef = parent.store.context.allowMouseUpTriggerRef;
      } else if (parent.type !== void 0) {
        this.context.allowMouseUpTriggerRef = parent.context.allowMouseUpTriggerRef;
      }
    });
  }
  /**
   * Propagates changes of the parent menu's shared tree state to this store's subscribers.
   * The owning `Menu.Root` calls it from an effect so the parent store subscription is released
   * when the submenu unmounts.
   * @returns A function that removes the parent store subscription.
   */
  subscribeToParentMenu() {
    const parent = this.state.parent;
    if (parent.type !== "menu") {
      return void 0;
    }
    let rootId = parent.store.select("rootId");
    let floatingTreeRoot = parent.store.select("floatingTreeRoot");
    let keyboardEventRelay = parent.store.select("keyboardEventRelay");
    return parent.store.subscribe(() => {
      const nextRootId = parent.store.select("rootId");
      const nextFloatingTreeRoot = parent.store.select("floatingTreeRoot");
      const nextKeyboardEventRelay = parent.store.select("keyboardEventRelay");
      if (rootId === nextRootId && floatingTreeRoot === nextFloatingTreeRoot && keyboardEventRelay === nextKeyboardEventRelay) {
        return;
      }
      rootId = nextRootId;
      floatingTreeRoot = nextFloatingTreeRoot;
      keyboardEventRelay = nextKeyboardEventRelay;
      this.notifyAll();
    });
  }
  setOpen(open2, eventDetails) {
    this.state.floatingRootContext.context.events.emit("setOpen", {
      open: open2,
      eventDetails
    });
  }
  setActiveIndex(activeIndex, reason, event) {
    if (this.state.activeIndex !== activeIndex) {
      const item = activeIndex === null ? void 0 : this.context.itemDomElements.current[activeIndex];
      const isWriteBack = item === this.context.reportedItem;
      this.context.highlightReason = isWriteBack ? "none" : reason;
      this.context.highlightEvent = isWriteBack ? void 0 : event;
    }
    this.set("activeIndex", activeIndex);
  }
  highlightItem(element, reason, event) {
    const index2 = this.context.itemDomElements.current.indexOf(element);
    if (index2 > -1) {
      this.setActiveIndex(index2, reason, event);
    }
  }
};
function createNullMenuStore() {
  const triggerElements = new PopupTriggerMap();
  const store = new NullStore(Object.freeze(createInitialState(triggerElements)), Object.freeze(createInitialContext(triggerElements)), selectors2);
  return Object.assign(store, {
    setOpen: NOOP
  });
}
function createInitialContext(triggerElements) {
  return {
    positionerRef: /* @__PURE__ */ createRef(),
    popupRef: /* @__PURE__ */ createRef(),
    typingRef: {
      current: false
    },
    itemDomElements: {
      current: []
    },
    itemLabels: {
      current: []
    },
    highlightReason: "none",
    highlightEvent: void 0,
    reportedItem: void 0,
    allowMouseUpTriggerRef: {
      current: false
    },
    virtualFocusRef: void 0,
    triggerFocusTargetRef: /* @__PURE__ */ createRef(),
    beforeTriggerFocusGuardRef: /* @__PURE__ */ createRef(),
    beforeContentFocusGuardRef: /* @__PURE__ */ createRef(),
    onOpenChangeComplete: void 0,
    triggerElements
  };
}
function createInitialState(triggerElements, floatingId, nested = false, initialState) {
  return {
    ...createInitialPopupStoreState(triggerElements, floatingId, nested),
    disabled: false,
    modal: true,
    openMethod: null,
    keyboardOpen: false,
    allowMouseEnter: false,
    highlightItemOnHover: true,
    parent: {
      type: void 0
    },
    rootId: void 0,
    activeIndex: null,
    listElement: null,
    filterTriggerProps: EMPTY_OBJECT,
    inputProps: EMPTY_OBJECT,
    inputFocused: false,
    highlightedItem: void 0,
    hoverEnabled: true,
    instantType: void 0,
    openChangeReason: null,
    floatingTreeRoot: new FloatingTreeStore(),
    floatingNodeId: void 0,
    floatingParentNodeId: null,
    itemProps: EMPTY_OBJECT,
    keyboardEventRelay: void 0,
    closeDelay: 0,
    adaptiveOrigin: void 0,
    ...initialState
  };
}

// node_modules/@base-ui/react/menu/filter-provider/MenuFilterProviderContext.mjs
init_react();
var MenuFilterProviderContext = /* @__PURE__ */ createContext(null);
if (false) MenuFilterProviderContext.displayName = "MenuFilterProviderContext";

// node_modules/@base-ui/react/menu/utils/isKeyboardOpen.mjs
function isKeyboardClick(reason, event) {
  return (reason === reason_parts_exports.triggerPress || reason === reason_parts_exports.itemPress) && event?.detail === 0;
}
function isKeyboardOpen(reason, event) {
  return reason === reason_parts_exports.listNavigation || isKeyboardClick(reason, event);
}

// node_modules/@base-ui/react/menu/root/MenuRoot.mjs
var MenuRootInternal = fastComponent(function MenuRootInternal2(props) {
  const {
    children,
    open: openProp,
    onOpenChange,
    onOpenChangeComplete,
    onItemHighlighted: onItemHighlightedProp,
    defaultOpen = false,
    disabled: disabledProp = false,
    modal: modalProp,
    loopFocus = true,
    orientation = "vertical",
    actionsRef,
    closeParentOnEsc = false,
    handle,
    triggerId: triggerIdProp,
    defaultTriggerId: defaultTriggerIdProp = null,
    highlightItemOnHover = true,
    isSubmenu = false,
    virtualFocus = false,
    virtualFocusRef,
    allowEscape = true,
    resetOnPointerLeave = true
  } = props;
  const contextMenuContext = useContextMenuRootContext(true);
  const parentMenuRootContext = useMenuRootContext(true);
  const menubarContext = useMenubarContext(true);
  const enclosingMenuStore = parentMenuRootContext?.store;
  const parentVirtualFocus = parentMenuRootContext?.virtualFocus ?? false;
  const parentFromContext = useMemo(() => {
    if (isSubmenu && enclosingMenuStore) {
      return {
        type: "menu",
        store: enclosingMenuStore
      };
    }
    if (menubarContext) {
      return {
        type: "menubar",
        context: menubarContext
      };
    }
    if (contextMenuContext && !enclosingMenuStore) {
      return {
        type: "context-menu",
        context: contextMenuContext
      };
    }
    return {
      type: void 0
    };
  }, [contextMenuContext, enclosingMenuStore, menubarContext, isSubmenu]);
  const rootId = useBaseUiId();
  const defaultFloatingId = useBaseUiId();
  const [renderedFloatingId, setRenderedFloatingId] = useState(void 0);
  const floatingId = (renderedFloatingId ?? defaultFloatingId) || void 0;
  const floatingParentNodeIdFromContext = useFloatingParentNodeId();
  const parentMenuStore = parentFromContext.type === "menu" ? parentFromContext.store : void 0;
  const animateInitialOpen = (openProp ?? defaultOpen) && parentMenuStore?.state.transitionStatus === "starting";
  const seededInstantType = useRefWithInit(() => animateInitialOpen ? parentMenuStore?.state.instantType : void 0).current;
  const store = useRefWithInit(() => {
    const menuStore = new MenuStore({
      open: defaultOpen,
      openProp,
      activeTriggerId: defaultTriggerIdProp,
      triggerIdProp,
      parent: parentFromContext,
      disabled: disabledProp,
      highlightItemOnHover,
      modal: parentFromContext.type === void 0 ? modalProp : void 0,
      rootId,
      instantType: seededInstantType
    }, floatingId, floatingParentNodeIdFromContext != null);
    menuStore.context.virtualFocusRef = virtualFocusRef;
    return menuStore;
  }).current;
  store.useControlledProp("openProp", openProp);
  store.useControlledProp("triggerIdProp", triggerIdProp);
  store.useContextCallback("onOpenChangeComplete", onOpenChangeComplete);
  const floatingTreeRoot = store.useState("floatingTreeRoot");
  const floatingNodeIdFromContext = useFloatingNodeId(floatingTreeRoot);
  const open2 = store.useState("open");
  const activeTriggerElement = store.useState("activeTriggerElement");
  const positionerElement = store.useState("positionerElement");
  const hoverEnabled = store.useState("hoverEnabled");
  const disabled2 = store.useState("disabled");
  const lastOpenChangeReason = store.useState("lastOpenChangeReason");
  const parent = store.useState("parent");
  const activeIndex = store.useState("activeIndex");
  const keyboardOpen = store.useState("keyboardOpen");
  const payload = store.useState("payload");
  const floatingParentNodeId = store.useState("floatingParentNodeId");
  const openEventRef = useRef(null);
  const allowOutsidePressDismissalRef = useRef(parent.type !== "context-menu");
  const allowOutsidePressDismissalTimeout = useTimeout();
  const allowTouchToCloseRef = useRef(true);
  const allowTouchToCloseTimeout = useTimeout();
  const nested = floatingParentNodeId != null;
  if (false) {
    if (parent.type !== void 0 && modalProp !== void 0) {
      console.warn("Base UI: The `modal` prop is not supported on nested menus. It will be ignored.");
    }
  }
  const {
    openMethod,
    triggerProps: interactionTypeProps
  } = useOpenInteractionType(open2);
  store.useSyncedValues({
    disabled: disabledProp,
    highlightItemOnHover,
    modal: parent.type === void 0 ? modalProp : void 0,
    openMethod,
    rootId
  });
  useImplicitActiveTrigger(store);
  const {
    forceUnmount,
    transitionStatus
  } = useOpenStateTransitions(open2, store, () => {
    store.set("allowMouseEnter", false);
  }, animateInitialOpen);
  const runOnceAnimationsFinish = useAnimationsFinished(store.context.popupRef);
  useEffect(() => {
    if (seededInstantType === void 0) {
      return void 0;
    }
    const clearSeededInstantType = () => {
      if (store.state.instantType === seededInstantType) {
        store.set("instantType", void 0);
      }
    };
    if (!open2) {
      clearSeededInstantType();
      return void 0;
    }
    if (transitionStatus !== void 0) {
      return void 0;
    }
    if (store.context.popupRef.current == null) {
      clearSeededInstantType();
      return void 0;
    }
    const abortController = new AbortController();
    runOnceAnimationsFinish(clearSeededInstantType, abortController.signal);
    return () => {
      abortController.abort();
    };
  }, [seededInstantType, open2, transitionStatus, runOnceAnimationsFinish, store]);
  useIsoLayoutEffect(() => {
    if (contextMenuContext && !parentMenuRootContext) {
      store.update({
        parent: {
          type: "context-menu",
          context: contextMenuContext
        },
        floatingNodeId: floatingNodeIdFromContext,
        floatingParentNodeId: floatingParentNodeIdFromContext
      });
    } else if (parentMenuRootContext || !store.select("activeTriggerElement")) {
      store.update({
        floatingNodeId: floatingNodeIdFromContext,
        floatingParentNodeId: floatingParentNodeIdFromContext
      });
    }
  }, [contextMenuContext, parentMenuRootContext, floatingNodeIdFromContext, floatingParentNodeIdFromContext, activeTriggerElement, store]);
  useEffect(() => {
    if (!open2) {
      openEventRef.current = null;
    }
    if (parent.type !== "context-menu") {
      return;
    }
    if (!open2) {
      allowOutsidePressDismissalTimeout.clear();
      allowOutsidePressDismissalRef.current = false;
      return;
    }
    allowOutsidePressDismissalTimeout.start(500, () => {
      allowOutsidePressDismissalRef.current = true;
    });
  }, [allowOutsidePressDismissalTimeout, open2, parent.type]);
  useIsoLayoutEffect(() => {
    if (!open2 && !hoverEnabled) {
      store.set("hoverEnabled", true);
    }
  }, [open2, hoverEnabled, store]);
  const setOpen = useStableCallback((nextOpen, eventDetails) => {
    const reason = eventDetails.reason;
    if (!nextOpen && !store.select("open")) {
      return;
    }
    if (open2 === nextOpen && eventDetails.trigger === activeTriggerElement && lastOpenChangeReason === reason) {
      return;
    }
    const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(eventDetails);
    if (!nextOpen && eventDetails.trigger == null) {
      eventDetails.trigger = activeTriggerElement ?? void 0;
    }
    onOpenChange?.(nextOpen, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    store.state.floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);
    const nativeEvent = eventDetails.event;
    if (nextOpen === false && reason !== reason_parts_exports.itemPress && nativeEvent?.type === "click" && nativeEvent.pointerType === "touch" && !allowTouchToCloseRef.current) {
      return;
    }
    if (nextOpen && reason === reason_parts_exports.triggerFocus) {
      allowTouchToCloseRef.current = false;
      allowTouchToCloseTimeout.start(300, () => {
        allowTouchToCloseRef.current = true;
      });
    } else {
      allowTouchToCloseRef.current = true;
      allowTouchToCloseTimeout.clear();
    }
    const isDismissClose = !nextOpen && (reason === reason_parts_exports.escapeKey || reason == null);
    openEventRef.current = eventDetails.event;
    const popupOpenState = createPopupOpenState(store.state, nextOpen, eventDetails.trigger, shouldPreventUnmountOnClose());
    popupOpenState.openChangeReason = reason;
    popupOpenState.keyboardOpen = nextOpen && isKeyboardOpen(reason, nativeEvent);
    if (parent.type === "menubar" && (reason === reason_parts_exports.triggerFocus || reason === reason_parts_exports.focusOut || reason === reason_parts_exports.triggerHover || reason === reason_parts_exports.listNavigation || reason === reason_parts_exports.siblingOpen)) {
      popupOpenState.instantType = "group";
    } else if (isKeyboardClick(reason, nativeEvent)) {
      popupOpenState.instantType = "click";
    } else if (isDismissClose) {
      popupOpenState.instantType = "dismiss";
    } else {
      popupOpenState.instantType = void 0;
    }
    store.update(popupOpenState);
  });
  const floatingRootContext = useSyncedFloatingRootContext({
    popupStore: store,
    floatingRootContext: store.state.floatingRootContext,
    floatingId,
    nested: floatingParentNodeIdFromContext != null,
    onOpenChange: setOpen
  });
  const floatingEvents = floatingRootContext.context.events;
  useIsoLayoutEffect(() => {
    const handleSetOpenEvent = ({
      open: nextOpen,
      eventDetails
    }) => setOpen(nextOpen, eventDetails);
    floatingEvents.on("setOpen", handleSetOpenEvent);
    return () => {
      floatingEvents?.off("setOpen", handleSetOpenEvent);
    };
  }, [floatingEvents, setOpen]);
  useIsoLayoutEffect(() => store.subscribeToParentMenu(), [store]);
  const handleImperativeClose = useCallback(() => {
    store.setOpen(false, createChangeEventDetails(reason_parts_exports.imperativeAction));
  }, [store]);
  useImperativeHandle(actionsRef, () => ({
    unmount: forceUnmount,
    close: handleImperativeClose
  }), [forceUnmount, handleImperativeClose]);
  let ctx;
  if (parent.type === "context-menu") {
    ctx = parent.context;
  }
  useImperativeHandle(ctx?.positionerRef, () => positionerElement, [positionerElement]);
  useImperativeHandle(ctx?.actionsRef, () => ({
    setOpen
  }), [setOpen]);
  const dismiss = useDismiss(floatingRootContext, {
    enabled: !disabled2,
    bubbles: {
      escapeKey: closeParentOnEsc && parent.type === "menu"
    },
    outsidePress() {
      if (parent.type !== "context-menu" || openEventRef.current?.type === "contextmenu") {
        return true;
      }
      return allowOutsidePressDismissalRef.current;
    },
    externalTree: nested ? floatingTreeRoot : void 0
  });
  const direction = useDirection();
  const listNavigation2 = useListNavigation(floatingRootContext, {
    enabled: !disabled2,
    listRef: store.context.itemDomElements,
    activeIndex,
    virtual: virtualFocus,
    nested: parent.type === "menubar" || !virtualFocus && parent.type !== void 0,
    parentOrientation: parent.type === "menubar" ? parent.context.orientation : void 0,
    loopFocus,
    // Filtered menus keep DOM focus on the input, while keyboard and virtual opens initially
    // highlight an item as ordinary menus do. The input stays in the arrow-key loop unless the
    // filter highlights automatically.
    focusItemOnOpen: virtualFocus ? keyboardOpen : void 0,
    allowEscape: virtualFocus && loopFocus && allowEscape,
    orientation,
    // A virtual-focus list can navigate on either axis, but its trigger always opens on the
    // vertical one.
    triggerOrientation: virtualFocus ? "vertical" : orientation,
    rtl: direction === "rtl",
    disabledIndices: EMPTY_ARRAY,
    onNavigate(nextActiveIndex, event) {
      store.setActiveIndex(nextActiveIndex, getHighlightReason(event), event?.nativeEvent);
    },
    // A virtual-focus submenu's keyboard opening is orchestrated by its navigation wrapper based
    // on both menus' orientations; the generic arrow-key opening would also react to the parent's
    // forwarded cross-axis keys while closed.
    openOnArrowKeyDown: parent.type !== "context-menu" && !(virtualFocus && isSubmenu),
    externalTree: !virtualFocus && nested ? floatingTreeRoot : void 0,
    nestedReturnFocusRef: parentMenuStore?.context.virtualFocusRef,
    focusItemOnHover: highlightItemOnHover,
    resetOnPointerLeave
  });
  const onTyping = useCallback((nextTyping) => {
    store.context.typingRef.current = nextTyping;
  }, [store]);
  const typeahead = useTypeahead(floatingRootContext, {
    // Under virtual focus the input owns typing, so typeahead would race the filter query.
    enabled: !disabled2 && !virtualFocus,
    listRef: store.context.itemLabels,
    elementsRef: store.context.itemDomElements,
    activeIndex,
    resetMs: TYPEAHEAD_RESET_MS,
    onMatch: (index2, event) => {
      if (open2 && index2 !== activeIndex) {
        store.setActiveIndex(index2, reason_parts_exports.keyboard, event.nativeEvent);
      }
    },
    onTyping
  });
  const onItemHighlighted = useStableCallback(onItemHighlightedProp);
  const lastHighlightIndexRef = useRef(-1);
  const syncHighlightedItem = useStableCallback(() => {
    const index2 = store.state.activeIndex;
    const item = index2 === null ? void 0 : store.context.itemDomElements.current[index2] ?? void 0;
    if (item?.isConnected === false) {
      return;
    }
    const itemIndex = item === void 0 ? -1 : index2;
    if (lastHighlightIndexRef.current === itemIndex && store.context.reportedItem === item) {
      return;
    }
    lastHighlightIndexRef.current = itemIndex;
    store.context.reportedItem = item;
    if (virtualFocus) {
      store.set("highlightedItem", item);
    }
    const {
      highlightReason,
      highlightEvent
    } = store.context;
    store.context.highlightReason = reason_parts_exports.none;
    store.context.highlightEvent = void 0;
    if (!onItemHighlightedProp) {
      return;
    }
    onItemHighlighted(item, createGenericEventDetails(highlightReason, highlightEvent, {
      label: item === void 0 ? void 0 : store.context.itemLabels.current[itemIndex] ?? void 0
    }));
  });
  useIsoLayoutEffect(() => {
    syncHighlightedItem();
  }, [activeIndex, syncHighlightedItem]);
  const openTriggerProps = useMemo(() => {
    if (!virtualFocus) {
      return listNavigation2.reference;
    }
    if (!listNavigation2.trigger) {
      return EMPTY_OBJECT;
    }
    const {
      onFocus,
      ...rest
    } = listNavigation2.trigger;
    return rest;
  }, [virtualFocus, listNavigation2.reference, listNavigation2.trigger]);
  store.useSyncedValue("inputProps", virtualFocus ? listNavigation2.reference ?? EMPTY_OBJECT : EMPTY_OBJECT);
  const activeTriggerProps = useMemo(() => {
    const mergedProps = mergeProps(typeahead.reference, openTriggerProps, dismiss.reference, {
      onMouseMove() {
        store.set("allowMouseEnter", true);
      }
    }, interactionTypeProps);
    mergedProps["aria-haspopup"] = "menu";
    mergedProps["aria-expanded"] = open2;
    return mergedProps;
  }, [store, typeahead.reference, openTriggerProps, dismiss.reference, interactionTypeProps, open2]);
  const inactiveTriggerProps = useMemo(() => {
    const mergedProps = mergeProps(listNavigation2.trigger, dismiss.trigger, interactionTypeProps);
    mergedProps["aria-haspopup"] = "menu";
    mergedProps["aria-expanded"] = false;
    return mergedProps;
  }, [listNavigation2.trigger, dismiss.trigger, interactionTypeProps]);
  useRefWithInit(() => {
    store.update({
      inactiveTriggerProps
    });
    return null;
  });
  const popupProps = useMemo(() => mergeProps(FOCUSABLE_POPUP_PROPS, {
    onMouseMove() {
      store.set("allowMouseEnter", true);
      if (parent.type === "menu") {
        store.set("hoverEnabled", false);
      }
    },
    onClick() {
      if (store.select("hoverEnabled")) {
        store.set("hoverEnabled", false);
      }
    },
    onKeyDown(event) {
      const relay = store.select("keyboardEventRelay");
      if (relay && !event.isPropagationStopped()) {
        relay(event);
      }
    }
  }, typeahead.floating, listNavigation2.floating, dismiss.floating), [parent.type, store, typeahead.floating, listNavigation2.floating, dismiss.floating]);
  const itemProps = listNavigation2.item ?? EMPTY_OBJECT;
  usePopupInteractionProps(store, {
    floatingRootContext,
    activeTriggerProps,
    inactiveTriggerProps,
    popupProps,
    itemProps
  });
  const context = useMemo(() => ({
    store,
    parent: parentFromContext,
    orientation,
    loopFocus,
    allowEscape,
    defaultFloatingId,
    setRenderedFloatingId,
    virtualFocus,
    parentVirtualFocus,
    syncHighlightedItem
  }), [store, parentFromContext, orientation, loopFocus, allowEscape, defaultFloatingId, virtualFocus, parentVirtualFocus, syncHighlightedItem]);
  const renderedChildren = typeof children === "function" ? children({
    payload
  }) : children;
  let content = /* @__PURE__ */ jsxs(MenuRootContext.Provider, {
    value: context,
    children: [handle && /* @__PURE__ */ jsx(PopupHandleAttachment, {
      handle,
      store
    }), renderedChildren]
  });
  if (parent.type === void 0 || parent.type === "context-menu") {
    content = /* @__PURE__ */ jsx(FloatingTree, {
      externalTree: floatingTreeRoot,
      children: content
    });
  }
  return content;
});
if (false) MenuRootInternal.displayName = "MenuRootInternal";
function MenuRoot(props) {
  const filterProvider = useContext(MenuFilterProviderContext);
  if (filterProvider === null) {
    return /* @__PURE__ */ jsx(MenuRootInternal, {
      ...props
    });
  }
  const FilterRoot = filterProvider.Root;
  return (
    // The root consumes its provider so a plain submenu inside doesn't inherit it.
    /* @__PURE__ */ jsx(MenuFilterProviderContext.Provider, {
      value: null,
      children: /* @__PURE__ */ jsx(FilterRoot, {
        ...filterProvider.options,
        ...props
      })
    })
  );
}

// node_modules/@base-ui/react/menu/submenu-root/MenuSubmenuRoot.mjs
init_react();
var EMPTY_SUBMENU_ROOT_CONTEXT = {};
function MenuSubmenuRoot(props) {
  useMenuRootContext();
  const filterProvider = useContext(MenuFilterProviderContext);
  if (filterProvider !== null) {
    const FilterSubmenuRoot = filterProvider.SubmenuRoot;
    return /* @__PURE__ */ jsx(MenuFilterProviderContext.Provider, {
      value: null,
      children: /* @__PURE__ */ jsx(FilterSubmenuRoot, {
        ...filterProvider.options,
        ...props
      })
    });
  }
  return /* @__PURE__ */ jsx(MenuSubmenuRootContext.Provider, {
    value: EMPTY_SUBMENU_ROOT_CONTEXT,
    children: /* @__PURE__ */ jsx(MenuRootInternal, {
      ...props,
      isSubmenu: true
    })
  });
}

// node_modules/@base-ui/react/menu/trigger/MenuTrigger.mjs
init_react();

// node_modules/@base-ui/react/utils/getPseudoElementBounds.mjs
var BOUNDARY_OFFSET = 5;
function isMouseWithinBounds(event, element) {
  const bounds = getPseudoElementBounds(element);
  return event.clientX >= bounds.left - BOUNDARY_OFFSET && event.clientX <= bounds.right + BOUNDARY_OFFSET && event.clientY >= bounds.top - BOUNDARY_OFFSET && event.clientY <= bounds.bottom + BOUNDARY_OFFSET;
}
function getPseudoElementBounds(element) {
  const elementRect = element.getBoundingClientRect();
  const win = getWindow(element);
  if (parts_exports.env.jsdom) {
    return elementRect;
  }
  const beforeStyles = win.getComputedStyle(element, "::before");
  const afterStyles = win.getComputedStyle(element, "::after");
  const hasPseudoElements = beforeStyles.content !== "none" || afterStyles.content !== "none";
  if (!hasPseudoElements) {
    return elementRect;
  }
  const beforeWidth = parseFloat(beforeStyles.width) || 0;
  const beforeHeight = parseFloat(beforeStyles.height) || 0;
  const afterWidth = parseFloat(afterStyles.width) || 0;
  const afterHeight = parseFloat(afterStyles.height) || 0;
  const totalWidth = Math.max(elementRect.width, beforeWidth, afterWidth);
  const totalHeight = Math.max(elementRect.height, beforeHeight, afterHeight);
  const widthDiff = totalWidth - elementRect.width;
  const heightDiff = totalHeight - elementRect.height;
  return {
    left: elementRect.left - widthDiff / 2,
    right: elementRect.right + widthDiff / 2,
    top: elementRect.top - heightDiff / 2,
    bottom: elementRect.bottom + heightDiff / 2
  };
}

// node_modules/@base-ui/react/internals/composite/item/useCompositeItem.mjs
init_react();
function useCompositeItem(params = {}) {
  const {
    highlightItemOnHover,
    highlightedIndex,
    onHighlightedIndexChange
  } = useCompositeRootContext();
  const {
    ref,
    index: index2
  } = useCompositeListItem(params);
  const isHighlighted = highlightedIndex === index2;
  const itemRef = useRef(null);
  const mergedRef = useMergedRefs(ref, itemRef);
  const compositeProps = {
    tabIndex: isHighlighted ? 0 : -1,
    onFocus() {
      onHighlightedIndexChange(index2);
    },
    onMouseMove() {
      const item = itemRef.current;
      if (!highlightItemOnHover || !item) {
        return;
      }
      const disabled2 = item.hasAttribute("disabled") || item.ariaDisabled === "true";
      if (!isHighlighted && !disabled2) {
        item.focus();
      }
    }
  };
  return {
    compositeProps,
    compositeRef: mergedRef,
    index: index2
  };
}

// node_modules/@base-ui/react/internals/composite/item/CompositeItem.mjs
function CompositeItem(componentProps) {
  const {
    render,
    className,
    style,
    state = EMPTY_OBJECT,
    props = EMPTY_ARRAY,
    refs = EMPTY_ARRAY,
    metadata,
    stateAttributesMapping: stateAttributesMapping2,
    tag = "div",
    ...elementProps
  } = componentProps;
  const {
    compositeProps,
    compositeRef
  } = useCompositeItem({
    metadata
  });
  return useRenderElement(tag, componentProps, {
    state,
    // The composite ref attaches first so an outer item wins when nested items share a DOM node.
    ref: [compositeRef, ...refs],
    props: [compositeProps, ...props, elementProps],
    stateAttributesMapping: stateAttributesMapping2
  });
}

// node_modules/@base-ui/react/menu/utils/findRootOwnerId.mjs
function findRootOwnerId(node) {
  if (isHTMLElement(node) && node.hasAttribute("data-rootownerid")) {
    return node.getAttribute("data-rootownerid");
  }
  if (isLastTraversableNode(node)) {
    return void 0;
  }
  return findRootOwnerId(getParentNode(node));
}

// node_modules/@base-ui/react/utils/popups/useTriggerFocusGuards.mjs
function useTriggerFocusGuards(store, triggerElementRef) {
  function closeAndFocus(event, direction, positionerElement) {
    const guard = event.currentTarget;
    flushSync(() => {
      store.setOpen(false, createChangeEventDetails(reason_parts_exports.focusOut, event.nativeEvent, guard));
    });
    getTabbableNearElement(guard.isConnected ? guard : triggerElementRef.current, direction, positionerElement)?.focus();
  }
  function handlePreFocusGuardFocus(event) {
    closeAndFocus(event, -1, store.select("positionerElement"));
  }
  function handleFocusTargetFocus(event) {
    const positionerElement = store.select("positionerElement");
    if (positionerElement && isOutsideEvent(event, positionerElement)) {
      store.context.beforeContentFocusGuardRef.current?.focus();
    } else {
      closeAndFocus(event, 1, positionerElement);
    }
  }
  return {
    handlePreFocusGuardFocus,
    handleFocusTargetFocus
  };
}

// node_modules/@base-ui/react/utils/useMixedToggleClickHandler.mjs
init_react();
function useMixedToggleClickHandler(params) {
  const {
    enabled = true,
    mouseDownAction,
    open: open2
  } = params;
  const ignoreClickRef = useRef(false);
  return useMemo(() => {
    if (!enabled) {
      return EMPTY_OBJECT;
    }
    return {
      onMouseDown: (event) => {
        if (mouseDownAction === "open" && !open2 || mouseDownAction === "close" && open2) {
          ignoreClickRef.current = true;
          ownerDocument(event.currentTarget).addEventListener("click", () => {
            ignoreClickRef.current = false;
          }, {
            once: true
          });
        }
      },
      onClick: (event) => {
        if (ignoreClickRef.current) {
          ignoreClickRef.current = false;
          event.preventBaseUIHandler();
        }
      }
    };
  }, [enabled, mouseDownAction, open2]);
}

// node_modules/@base-ui/react/menu/trigger/MenuTrigger.mjs
var MenuTrigger = fastComponentRef(function MenuTrigger2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    disabled: disabledProp = false,
    nativeButton = true,
    id: idProp,
    openOnHover: openOnHoverProp,
    delay = 100,
    closeDelay = 0,
    handle,
    payload,
    ...elementProps
  } = componentProps;
  const rootContext = useMenuRootContext(true);
  const handleStore = usePopupHandleStore(handle);
  const store = handleStore ?? rootContext?.store;
  if (!store) {
    throw new Error(false ? "Base UI: <Menu.Trigger> must be either used within a <Menu.Root> component or provided with a handle." : formatErrorMessage_default(85));
  }
  const thisTriggerId = useBaseUiId(idProp);
  const isTriggerActive = store.useState("isTriggerActive", thisTriggerId);
  const floatingRootContext = store.useState("floatingRootContext");
  const isOpenedByThisTrigger = store.useState("isOpenedByTrigger", thisTriggerId);
  const controlsId = store.useState("triggerControlsId", thisTriggerId);
  const triggerElementRef = useRef(null);
  const parent = useMenuParent();
  const compositeRootContext = useCompositeRootContext(true);
  const floatingTreeRootFromContext = useFloatingTree();
  const floatingTreeRoot = useMemo(() => {
    return floatingTreeRootFromContext ?? new FloatingTreeStore();
  }, [floatingTreeRootFromContext]);
  const floatingNodeId = useFloatingNodeId(floatingTreeRoot);
  const floatingParentNodeId = useFloatingParentNodeId();
  const {
    registerTrigger,
    isMountedByThisTrigger
  } = useTriggerDataForwarding(thisTriggerId, triggerElementRef, store, {
    payload,
    closeDelay,
    parent,
    floatingTreeRoot,
    floatingNodeId,
    floatingParentNodeId,
    keyboardEventRelay: compositeRootContext?.relayKeyboardEvent
  });
  const isInMenubar = parent.type === "menubar";
  const rootDisabled = store.useState("disabled");
  const disabled2 = disabledProp || rootDisabled || isInMenubar && parent.context.disabled;
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled: disabled2,
    native: nativeButton
  });
  useEffect(() => {
    if (!isOpenedByThisTrigger && parent.type === void 0) {
      store.context.allowMouseUpTriggerRef.current = false;
    }
  }, [store, isOpenedByThisTrigger, parent.type]);
  const triggerRef = useRef(null);
  const allowMouseUpTriggerTimeout = useTimeout();
  const handleDocumentMouseUp = useStableCallback((mouseEvent) => {
    if (!triggerRef.current) {
      return;
    }
    allowMouseUpTriggerTimeout.clear();
    store.context.allowMouseUpTriggerRef.current = false;
    const mouseUpTarget = mouseEvent.target;
    if (contains(triggerRef.current, mouseUpTarget) || contains(store.select("positionerElement"), mouseUpTarget) || mouseUpTarget === triggerRef.current) {
      return;
    }
    if (mouseUpTarget != null && findRootOwnerId(mouseUpTarget) === store.select("rootId")) {
      return;
    }
    if (isMouseWithinBounds(mouseEvent, triggerRef.current)) {
      return;
    }
    floatingTreeRoot.events.emit("close", {
      domEvent: mouseEvent,
      reason: reason_parts_exports.cancelOpen
    });
  });
  useEffect(() => {
    const doc = ownerDocument(triggerRef.current);
    if (isOpenedByThisTrigger && store.select("lastOpenChangeReason") === reason_parts_exports.triggerHover) {
      doc.addEventListener("mouseup", handleDocumentMouseUp, {
        once: true
      });
      return () => {
        doc.removeEventListener("mouseup", handleDocumentMouseUp);
      };
    }
    return void 0;
  }, [isOpenedByThisTrigger, handleDocumentMouseUp, store]);
  const parentMenubarHasSubmenuOpen = isInMenubar && parent.context.hasSubmenuOpen;
  const openOnHover = openOnHoverProp ?? parentMenubarHasSubmenuOpen;
  const hoverProps = useHoverReferenceInteraction(floatingRootContext, {
    enabled: openOnHover && !disabled2 && (!isInMenubar || parentMenubarHasSubmenuOpen && !isMountedByThisTrigger),
    handleClose: safePolygon({
      blockPointerEvents: !isInMenubar
    }),
    mouseOnly: true,
    move: false,
    restMs: parent.type === void 0 ? delay : void 0,
    delay: {
      close: closeDelay
    },
    triggerElementRef,
    externalTree: floatingTreeRoot,
    isActiveTrigger: isTriggerActive,
    isClosing: () => store.select("transitionStatus") === "ending"
  });
  const stickIfOpen = useStickIfOpen(isOpenedByThisTrigger, store.select("lastOpenChangeReason"));
  const click = useClick(floatingRootContext, {
    enabled: !disabled2,
    event: isOpenedByThisTrigger && isInMenubar ? "click" : "mousedown",
    toggle: true,
    ignoreMouse: false,
    stickIfOpen: parent.type === void 0 ? stickIfOpen : false
  });
  const focus = useFocus(floatingRootContext, {
    enabled: !disabled2 && parentMenubarHasSubmenuOpen
  });
  const mixedToggleHandlers = useMixedToggleClickHandler({
    open: isOpenedByThisTrigger,
    enabled: isInMenubar,
    mouseDownAction: "open"
  });
  const localInteractionProps = useMemo(() => mergeProps(focus.reference, click.reference), [focus.reference, click.reference]);
  const rootTriggerProps = store.useState("triggerProps", isMountedByThisTrigger);
  const filterTriggerProps = store.useState("filterTriggerProps");
  const {
    handlePreFocusGuardFocus,
    handleFocusTargetFocus
  } = useTriggerFocusGuards(store, triggerElementRef);
  const state = {
    disabled: disabled2,
    open: isOpenedByThisTrigger
  };
  const ref = [triggerRef, forwardedRef, buttonRef, registerTrigger, triggerElementRef];
  const props = [localInteractionProps, hoverProps ?? EMPTY_OBJECT, rootTriggerProps, {
    "aria-haspopup": "menu",
    "aria-controls": controlsId,
    id: thisTriggerId,
    onMouseDown: (event) => {
      if (store.select("open")) {
        return;
      }
      allowMouseUpTriggerTimeout.start(200, () => {
        store.context.allowMouseUpTriggerRef.current = true;
      });
      const doc = ownerDocument(event.currentTarget);
      doc.addEventListener("mouseup", handleDocumentMouseUp, {
        once: true
      });
    }
  }, filterTriggerProps, isInMenubar ? {
    role: "menuitem"
  } : {}, mixedToggleHandlers, elementProps, getButtonProps];
  const element = useRenderElement("button", componentProps, {
    enabled: !isInMenubar,
    stateAttributesMapping: pressableTriggerOpenStateMapping,
    state,
    ref,
    props
  });
  if (isInMenubar) {
    return /* @__PURE__ */ jsx(CompositeItem, {
      tag: "button",
      render,
      className,
      style,
      state,
      refs: ref,
      props,
      stateAttributesMapping: pressableTriggerOpenStateMapping
    });
  }
  if (isOpenedByThisTrigger) {
    return /* @__PURE__ */ jsxs(Fragment, {
      children: [/* @__PURE__ */ jsx(FocusGuard, {
        ref: store.context.beforeTriggerFocusGuardRef,
        onFocus: handlePreFocusGuardFocus
      }, `${thisTriggerId}-pre-focus-guard`), /* @__PURE__ */ jsx(Fragment, {
        children: element
      }, thisTriggerId), /* @__PURE__ */ jsx(FocusGuard, {
        ref: store.context.triggerFocusTargetRef,
        onFocus: handleFocusTargetFocus
      }, `${thisTriggerId}-post-focus-guard`)]
    });
  }
  return /* @__PURE__ */ jsx(Fragment, {
    children: element
  }, thisTriggerId);
});
if (false) MenuTrigger.displayName = "MenuTrigger";
function useStickIfOpen(open2, openReason) {
  const stickIfOpenTimeout = useTimeout();
  const [stickIfOpen, setStickIfOpen] = useState(false);
  useIsoLayoutEffect(() => {
    if (open2 && openReason === reason_parts_exports.triggerHover) {
      setStickIfOpen(true);
      stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => {
        setStickIfOpen(false);
      });
    } else if (!open2) {
      stickIfOpenTimeout.clear();
      setStickIfOpen(false);
    }
  }, [open2, openReason, stickIfOpenTimeout]);
  return stickIfOpen;
}
function useMenuParent() {
  const menubarContext = useMenubarContext(true);
  const parent = useMemo(() => {
    if (menubarContext) {
      return {
        type: "menubar",
        context: menubarContext
      };
    }
    return {
      type: void 0
    };
  }, [menubarContext]);
  return parent;
}

// node_modules/@base-ui/react/menu/viewport/MenuViewport.mjs
init_react();

// node_modules/@base-ui/react/utils/usePopupViewport.mjs
init_react();

// node_modules/@base-ui/utils/usePreviousValue.mjs
init_react();
function usePreviousValue(value) {
  const [state, setState] = useState({
    current: value,
    previous: null
  });
  if (!Object.is(value, state.current)) {
    setState({
      current: value,
      previous: state.current
    });
  }
  return state.previous;
}

// node_modules/@base-ui/react/utils/usePopupAutoResize.mjs
init_react();

// node_modules/@base-ui/react/utils/getCssDimensions.mjs
function getCssDimensions2(element) {
  const css = getComputedStyle2(element);
  let width = parseFloat(css.width) || 0;
  let height = parseFloat(css.height) || 0;
  const hasOffset = isHTMLElement(element);
  const offsetWidth = hasOffset ? element.offsetWidth : width;
  const offsetHeight = hasOffset ? element.offsetHeight : height;
  const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
  if (shouldFallback) {
    width = offsetWidth;
    height = offsetHeight;
  }
  return {
    width,
    height
  };
}

// node_modules/@base-ui/react/utils/CommonPopupCssVars.mjs
var popupWidth = "--popup-width";
var popupHeight = "--popup-height";

// node_modules/@base-ui/react/utils/usePopupAutoResize.mjs
function usePopupAutoResize(parameters) {
  const {
    popupElement,
    positionerElement,
    content,
    mounted,
    onMeasureLayout: onMeasureLayoutParam,
    onMeasureLayoutComplete: onMeasureLayoutCompleteParam,
    side,
    direction
  } = parameters;
  const runOnceAnimationsFinish = useAnimationsFinished(popupElement, true);
  const animationFrame = useAnimationFrame();
  const committedDimensionsRef = useRef(null);
  const onMeasureLayout = useStableCallback(onMeasureLayoutParam);
  const onMeasureLayoutComplete = useStableCallback(onMeasureLayoutCompleteParam);
  const anchoringStyles = useMemo(() => getPopupAnchoringStyles(side, direction), [side, direction]);
  useIsoLayoutEffect(() => {
    if (!mounted) {
      committedDimensionsRef.current = null;
      return void 0;
    }
    if (!popupElement || !positionerElement) {
      return void 0;
    }
    const restoreAnchoringStyles = applyElementStyles(popupElement, anchoringStyles);
    setPopupCssSize(popupElement, "auto");
    const restorePopupPosition = overrideElementStyle(popupElement, "position", "static");
    const restorePopupTransform = overrideElementStyle(popupElement, "transform", "none");
    const restorePopupScale = overrideElementStyle(popupElement, "scale", "1");
    const restorePositionerAvailableSize = applyElementStyles(positionerElement, {
      [availableWidth]: "max-content",
      [availableHeight]: "max-content"
    });
    function restoreMeasurementOverrides() {
      restorePopupPosition();
      restorePopupTransform();
      restorePositionerAvailableSize();
      restorePopupScale();
    }
    onMeasureLayout?.();
    if (committedDimensionsRef.current === null) {
      setPositionerCssSize(positionerElement, "max-content");
      const dimensions = getCssDimensions2(popupElement);
      committedDimensionsRef.current = dimensions;
      setPositionerCssSize(positionerElement, dimensions);
      restoreMeasurementOverrides();
      onMeasureLayoutComplete?.(null, dimensions);
      return restoreAnchoringStyles;
    }
    setPositionerCssSize(positionerElement, "max-content");
    const previousDimensions = committedDimensionsRef.current;
    const newDimensions = getCssDimensions2(popupElement);
    committedDimensionsRef.current = newDimensions;
    setPopupCssSize(popupElement, previousDimensions);
    restoreMeasurementOverrides();
    onMeasureLayoutComplete?.(previousDimensions, newDimensions);
    setPositionerCssSize(positionerElement, newDimensions);
    const abortController = new AbortController();
    animationFrame.request(() => {
      setPopupCssSize(popupElement, newDimensions);
      runOnceAnimationsFinish(() => {
        popupElement.style.setProperty(popupWidth, "auto");
        popupElement.style.setProperty(popupHeight, "auto");
      }, abortController.signal);
    });
    return () => {
      abortController.abort();
      animationFrame.cancel();
      restoreAnchoringStyles();
    };
  }, [content, popupElement, positionerElement, runOnceAnimationsFinish, animationFrame, mounted, onMeasureLayout, onMeasureLayoutComplete, anchoringStyles]);
}
function getPopupAnchoringStyles(side, direction) {
  const isPhysicalTop = side === "top";
  const isPhysicalLeft = side === "left" || side === (direction === "rtl" ? "inline-end" : "inline-start");
  if (!isPhysicalTop && !isPhysicalLeft) {
    return EMPTY_OBJECT;
  }
  return {
    position: "absolute",
    [isPhysicalTop ? "bottom" : "top"]: "0",
    [isPhysicalLeft ? "right" : "left"]: "0"
  };
}
function overrideElementStyle(element, property, value) {
  const originalValue = element.style.getPropertyValue(property);
  element.style.setProperty(property, value);
  return () => {
    element.style.setProperty(property, originalValue);
  };
}
function applyElementStyles(element, styles) {
  const restorers = [];
  for (const [key, value] of Object.entries(styles)) {
    restorers.push(overrideElementStyle(element, key, value));
  }
  return restorers.length ? () => {
    restorers.forEach((restore) => restore());
  } : NOOP;
}
function setPopupCssSize(popupElement, size4) {
  const width = size4 === "auto" ? "auto" : `${size4.width}px`;
  const height = size4 === "auto" ? "auto" : `${size4.height}px`;
  popupElement.style.setProperty(popupWidth, width);
  popupElement.style.setProperty(popupHeight, height);
}
function setPositionerCssSize(positionerElement, size4) {
  const width = size4 === "max-content" ? "max-content" : `${size4.width}px`;
  const height = size4 === "max-content" ? "max-content" : `${size4.height}px`;
  positionerElement.style.setProperty(positionerWidth, width);
  positionerElement.style.setProperty(positionerHeight, height);
}

// node_modules/@base-ui/react/utils/adaptiveOriginMiddleware.mjs
var adaptiveOrigin = {
  name: "adaptiveOrigin",
  async fn(state) {
    const {
      x: rawX,
      y: rawY,
      rects: {
        floating: floatRect
      },
      elements: {
        floating
      },
      platform: platform3,
      strategy,
      placement
    } = state;
    const win = getWindow(floating);
    const styles = win.getComputedStyle(floating);
    const hasTransition = styles.transitionDuration !== "0s" && styles.transitionDuration !== "";
    if (!hasTransition) {
      return {
        x: rawX,
        y: rawY,
        data: DEFAULT_SIDES
      };
    }
    const offsetParent = await platform3.getOffsetParent?.(floating);
    let offsetDimensions = {
      width: 0,
      height: 0
    };
    if (strategy === "fixed" && win?.visualViewport) {
      offsetDimensions = {
        width: win.visualViewport.width,
        height: win.visualViewport.height
      };
    } else if (offsetParent === win) {
      const doc = ownerDocument(floating);
      offsetDimensions = {
        width: doc.documentElement.clientWidth,
        height: doc.documentElement.clientHeight
      };
    } else if (await platform3.isElement?.(offsetParent)) {
      offsetDimensions = await platform3.getDimensions(offsetParent);
    }
    const currentSide = getSide(placement);
    let x = rawX;
    let y = rawY;
    if (currentSide === "left") {
      x = offsetDimensions.width - (rawX + floatRect.width);
    }
    if (currentSide === "top") {
      y = offsetDimensions.height - (rawY + floatRect.height);
    }
    const sideX = currentSide === "left" ? "right" : DEFAULT_SIDES.sideX;
    const sideY = currentSide === "top" ? "bottom" : DEFAULT_SIDES.sideY;
    return {
      x,
      y,
      data: {
        sideX,
        sideY
      }
    };
  }
};

// node_modules/@base-ui/react/utils/CommonViewportDataAttributes.mjs
var activationDirection = "data-activation-direction";

// node_modules/@base-ui/react/utils/usePopupViewport.mjs
var popupViewportStateMapping = {
  activationDirection: (value) => value ? {
    [activationDirection]: value
  } : null
};
function usePopupViewport(parameters) {
  const {
    store,
    side,
    children
  } = parameters;
  const direction = useDirection();
  const activeTrigger = store.useState("activeTriggerElement");
  const activeTriggerId = store.useState("activeTriggerId");
  const open2 = store.useState("open");
  const payload = store.useState("payload");
  const mounted = store.useState("mounted");
  const popupElement = store.useState("popupElement");
  const positionerElement = store.useState("positionerElement");
  const previousActiveTrigger = usePreviousValue(open2 ? activeTrigger : null);
  const currentContentKey = usePopupContentKey(activeTriggerId, payload);
  const capturedNodeRef = useRef(null);
  const [previousContentNode, setPreviousContentNode] = useState(null);
  const [newTriggerOffset, setNewTriggerOffset] = useState(null);
  const currentContainerRef = useRef(null);
  const previousContainerRef = useRef(null);
  const onAnimationsFinished = useAnimationsFinished(currentContainerRef, true);
  const cleanupFrame = useAnimationFrame();
  const cleanupControllerRef = useRef(null);
  const [previousContentDimensions, setPreviousContentDimensions] = useState(null);
  const [showStartingStyleAttribute, setShowStartingStyleAttribute] = useState(false);
  useIsoLayoutEffect(() => {
    store.set("adaptiveOrigin", adaptiveOrigin);
    return () => {
      store.set("adaptiveOrigin", void 0);
    };
  }, [store]);
  const handleMeasureLayout = useStableCallback(() => {
    currentContainerRef.current?.style.setProperty("animation", "none");
    currentContainerRef.current?.style.setProperty("transition", "none");
    previousContainerRef.current?.style.setProperty("display", "none");
  });
  const handleMeasureLayoutComplete = useStableCallback((previousDimensions) => {
    currentContainerRef.current?.style.removeProperty("animation");
    currentContainerRef.current?.style.removeProperty("transition");
    previousContainerRef.current?.style.removeProperty("display");
    if (previousDimensions) {
      setPreviousContentDimensions(previousDimensions);
    }
  });
  const armViewportCleanup = useStableCallback(() => {
    cleanupControllerRef.current?.abort();
    const controller = new AbortController();
    cleanupControllerRef.current = controller;
    onAnimationsFinished(() => {
      setPreviousContentNode(null);
      setPreviousContentDimensions(null);
      capturedNodeRef.current = null;
    }, controller.signal);
  });
  const lastHandledTriggerRef = useRef(null);
  useIsoLayoutEffect(() => {
    if (!open2 || !mounted) {
      lastHandledTriggerRef.current = null;
    }
  }, [open2, mounted]);
  useIsoLayoutEffect(() => {
    if (open2 && activeTrigger && previousActiveTrigger && activeTrigger !== previousActiveTrigger && lastHandledTriggerRef.current !== activeTrigger && capturedNodeRef.current) {
      setPreviousContentNode(capturedNodeRef.current);
      setShowStartingStyleAttribute(true);
      const offset4 = calculateRelativePosition(previousActiveTrigger, activeTrigger);
      setNewTriggerOffset(offset4);
      lastHandledTriggerRef.current = activeTrigger;
    }
  }, [open2, activeTrigger, previousActiveTrigger]);
  useIsoLayoutEffect(() => {
    if (previousContentNode == null) {
      return;
    }
    cleanupControllerRef.current?.abort();
    setShowStartingStyleAttribute(true);
    cleanupFrame.request(() => {
      flushSync(() => {
        setShowStartingStyleAttribute(false);
      });
      armViewportCleanup();
    });
  }, [currentContentKey, previousContentNode, armViewportCleanup, cleanupFrame]);
  useIsoLayoutEffect(() => {
    const source = currentContainerRef.current;
    if (!source) {
      return;
    }
    const wrapper = ownerDocument(source).createElement("div");
    for (const child of Array.from(source.childNodes)) {
      wrapper.appendChild(child.cloneNode(true));
    }
    capturedNodeRef.current = wrapper;
  });
  const isTransitioning = previousContentNode != null;
  let childrenToRender;
  if (!isTransitioning) {
    childrenToRender = /* @__PURE__ */ jsx("div", {
      "data-current": true,
      ref: currentContainerRef,
      children
    }, currentContentKey);
  } else {
    childrenToRender = /* @__PURE__ */ jsxs(Fragment, {
      children: [/* @__PURE__ */ jsx("div", {
        "data-previous": true,
        inert: inertValue(true),
        ref: previousContainerRef,
        style: {
          ...previousContentDimensions ? {
            [popupWidth]: `${previousContentDimensions.width}px`,
            [popupHeight]: `${previousContentDimensions.height}px`
          } : null,
          position: "absolute"
        },
        "data-ending-style": showStartingStyleAttribute ? void 0 : ""
      }, "previous"), /* @__PURE__ */ jsx("div", {
        "data-current": true,
        ref: currentContainerRef,
        "data-starting-style": showStartingStyleAttribute ? "" : void 0,
        children
      }, currentContentKey)]
    });
  }
  useIsoLayoutEffect(() => {
    const container = previousContainerRef.current;
    if (!container || !previousContentNode) {
      return;
    }
    container.replaceChildren(...Array.from(previousContentNode.childNodes));
  }, [previousContentNode]);
  usePopupAutoResize({
    popupElement,
    positionerElement,
    mounted,
    content: payload,
    onMeasureLayout: handleMeasureLayout,
    onMeasureLayoutComplete: handleMeasureLayoutComplete,
    side,
    direction
  });
  const state = {
    activationDirection: getActivationDirection(newTriggerOffset),
    transitioning: isTransitioning
  };
  return {
    children: childrenToRender,
    state
  };
}
function getActivationDirection(offset4) {
  if (!offset4) {
    return void 0;
  }
  return `${getValueWithTolerance(offset4.horizontal, 5, "right", "left")} ${getValueWithTolerance(offset4.vertical, 5, "down", "up")}`;
}
function getValueWithTolerance(value, tolerance, positiveLabel, negativeLabel) {
  if (value > tolerance) {
    return positiveLabel;
  }
  if (value < -tolerance) {
    return negativeLabel;
  }
  return "";
}
function calculateRelativePosition(from, to) {
  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const fromCenter = {
    x: fromRect.left + fromRect.width / 2,
    y: fromRect.top + fromRect.height / 2
  };
  const toCenter = {
    x: toRect.left + toRect.width / 2,
    y: toRect.top + toRect.height / 2
  };
  return {
    horizontal: toCenter.x - fromCenter.x,
    vertical: toCenter.y - fromCenter.y
  };
}
function usePopupContentKey(activeTriggerId, payload) {
  const [contentKey, setContentKey] = useState(0);
  const previousActiveTriggerIdRef = useRef(activeTriggerId);
  const previousPayloadRef = useRef(payload);
  const pendingPayloadUpdateRef = useRef(false);
  useIsoLayoutEffect(() => {
    const previousActiveTriggerId = previousActiveTriggerIdRef.current;
    const previousPayload = previousPayloadRef.current;
    const triggerIdChanged = activeTriggerId !== previousActiveTriggerId;
    const payloadChanged = payload !== previousPayload;
    if (triggerIdChanged) {
      setContentKey((value) => value + 1);
      pendingPayloadUpdateRef.current = !payloadChanged;
    } else if (pendingPayloadUpdateRef.current && payloadChanged) {
      setContentKey((value) => value + 1);
      pendingPayloadUpdateRef.current = false;
    }
    previousActiveTriggerIdRef.current = activeTriggerId;
    previousPayloadRef.current = payload;
  }, [activeTriggerId, payload]);
  return `${activeTriggerId ?? "current"}-${contentKey}`;
}

// node_modules/@base-ui/react/menu/viewport/MenuViewport.mjs
var MenuViewport = /* @__PURE__ */ forwardRef(function MenuViewport2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    children,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useMenuRootContext();
  const {
    side
  } = useMenuPositionerContext();
  const instantType = store.useState("instantType");
  const {
    children: childrenToRender,
    state: viewportState
  } = usePopupViewport({
    store,
    side,
    children
  });
  const state = {
    activationDirection: viewportState.activationDirection,
    transitioning: viewportState.transitioning,
    instant: instantType
  };
  return useRenderElement("div", componentProps, {
    state,
    ref: forwardedRef,
    props: [elementProps, {
      children: childrenToRender
    }],
    stateAttributesMapping: popupViewportStateMapping
  });
});
if (false) MenuViewport.displayName = "MenuViewport";

// node_modules/@base-ui/react/separator/Separator.mjs
init_react();
var Separator = /* @__PURE__ */ forwardRef(function SeparatorComponent(componentProps, forwardedRef) {
  const {
    className,
    render,
    orientation = "horizontal",
    style,
    ...elementProps
  } = componentProps;
  const state = {
    orientation
  };
  const element = useRenderElement("div", componentProps, {
    state,
    ref: forwardedRef,
    props: [{
      role: "separator",
      "aria-orientation": orientation
    }, elementProps]
  });
  return element;
});
if (false) Separator.displayName = "Separator";

// node_modules/@base-ui/react/menu/submenu-trigger/MenuSubmenuTrigger.mjs
init_react();

// node_modules/@base-ui/utils/isElementDisabled.mjs
function isElementDisabled(element) {
  return element == null || element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
}

// node_modules/@base-ui/react/menu/submenu-trigger/MenuSubmenuTrigger.mjs
var VOICE_OVER_EXPANDED_PROPS = {
  "aria-expanded": void 0
};
var MenuSubmenuTriggerPlain = /* @__PURE__ */ forwardRef(function MenuSubmenuTriggerPlain2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    label,
    id: idProp,
    nativeButton = false,
    openOnHover = true,
    delay = 100,
    closeDelay = 0,
    disabled: disabledProp = false,
    ...elementProps
  } = componentProps;
  const context = useMenuRootContext(true);
  if (context?.parent.type !== "menu") {
    throw new Error(false ? "Base UI: <Menu.SubmenuTrigger> must be placed in <Menu.SubmenuRoot>." : formatErrorMessage_default(37));
  }
  const menuPositionerContext = useMenuPositionerContext();
  const submenuRootContext = useMenuSubmenuRootContext();
  const {
    store,
    parentVirtualFocus
  } = context;
  const parentMenuStore = context.parent.store;
  const listItem = useCompositeListItem({
    guess: true,
    label
  });
  const thisTriggerId = useBaseUiId(idProp);
  const open2 = store.useState("open");
  const focusReturnedThroughGuardRef = useRef(false);
  const positionerElement = store.useState("positionerElement");
  const floatingRootContext = store.useState("floatingRootContext");
  const floatingTreeRoot = store.useState("floatingTreeRoot");
  const popupId = store.useState("triggerPopupId", thisTriggerId);
  const baseRegisterTrigger = useTriggerRegistration(thisTriggerId, store);
  const registerTrigger = useStableCallback((element2) => {
    baseRegisterTrigger(element2);
    const activeTriggerElement = store.select("activeTriggerElement");
    if (element2 !== null && store.select("open") && (activeTriggerElement === element2 || store.select("activeTriggerId") == null)) {
      store.update({
        activeTriggerId: thisTriggerId ?? null,
        activeTriggerElement: element2,
        closeDelay
      });
    }
  });
  const triggerElementRef = useRef(null);
  const handleTriggerElementRef = useCallback((el) => {
    triggerElementRef.current = el;
    store.set("activeTriggerElement", el);
  }, [store]);
  useIsoLayoutEffect(() => {
    registerTrigger(triggerElementRef.current);
    return () => registerTrigger(null);
  }, [registerTrigger, thisTriggerId, store]);
  useIsoLayoutEffect(() => {
    if (!open2 || !positionerElement) {
      return void 0;
    }
    function handleGuardFocusOut(event) {
      if (getTarget(event) === store.context.beforeContentFocusGuardRef.current) {
        focusReturnedThroughGuardRef.current = event.relatedTarget === triggerElementRef.current;
      }
    }
    positionerElement.addEventListener("focusout", handleGuardFocusOut, true);
    return () => {
      focusReturnedThroughGuardRef.current = false;
      positionerElement.removeEventListener("focusout", handleGuardFocusOut, true);
    };
  }, [open2, positionerElement, store]);
  store.useSyncedValue("closeDelay", closeDelay);
  const rootDisabled = store.useState("disabled");
  const parentDisabled = parentMenuStore.useState("disabled");
  const disabled2 = disabledProp || rootDisabled || parentDisabled;
  if (false) {
    useEffect(() => {
      const element2 = triggerElementRef.current;
      if (element2 && isElementDisabled(element2) && !disabled2) {
        const ownerStackMessage = SafeReact.captureOwnerStack?.() || "";
        warn(`A disabled element was detected on <Menu.SubmenuTrigger>. To properly disable the trigger, use the \`disabled\` prop on the component instead of setting it on the rendered element.${ownerStackMessage}`);
      }
    });
  }
  const itemProps = parentMenuStore.useState("itemProps");
  const highlighted = parentMenuStore.useState("isActive", listItem.index);
  const itemMetadata = useMemo(() => ({
    type: "submenu-trigger",
    setActive(event) {
      if (parentMenuStore.select("highlightItemOnHover")) {
        parentMenuStore.setActiveIndex(listItem.index, reason_parts_exports.pointer, event);
      }
    }
  }), [parentMenuStore, listItem.index]);
  const {
    getItemProps,
    itemRef
  } = useMenuItem({
    closeOnClick: false,
    disabled: disabled2,
    highlighted,
    id: thisTriggerId,
    store,
    typingRef: parentMenuStore.context.typingRef,
    nativeButton,
    itemMetadata,
    nodeId: menuPositionerContext?.context.nodeId
  });
  const hoverEnabled = store.useState("hoverEnabled");
  const hoverProps = useHoverReferenceInteraction(floatingRootContext, {
    enabled: hoverEnabled && openOnHover && !disabled2,
    handleClose: safePolygon({
      blockPointerEvents: true
    }),
    mouseOnly: true,
    move: true,
    restMs: delay,
    delay: {
      open: delay,
      close: closeDelay
    },
    shouldOpen: delay > 0 ? () => parentMenuStore.select("allowMouseEnter") : void 0,
    triggerElementRef,
    externalTree: floatingTreeRoot,
    isClosing: () => store.select("transitionStatus") === "ending",
    // Chrome can drop the trigger's `mouseleave` during a fast pointer sweep,
    // leaving a stale submenu open (see #5152) — cancel from `mouseout` too.
    guardStaleOpen: true
  });
  const click = useClick(floatingRootContext, {
    enabled: !disabled2,
    event: "mousedown",
    // Without toggling, TalkBack users cannot close the submenu to reach the next parent menu
    // item: moving the virtual cursor outside does not close it, and moving forward again
    // re-enters the still-open submenu. Keep toggling enabled so activating its trigger closes it.
    // Toggling applies to touch and keyboard activation. In hover mode, mouse presses are
    // ignored and the first activation after hover-opening keeps the submenu open.
    toggle: true,
    ignoreMouse: openOnHover,
    stickIfOpen: openOnHover
  });
  const localInteractionProps = click.reference ?? EMPTY_OBJECT;
  const rootTriggerProps = store.useState("triggerProps", true);
  delete rootTriggerProps.id;
  const state = {
    disabled: disabled2,
    highlighted,
    open: open2
  };
  const openMethod = store.useState("openMethod");
  const lastOpenChangeReason = store.useState("lastOpenChangeReason");
  const openedByKeyboard = lastOpenChangeReason === reason_parts_exports.listNavigation || openMethod === "keyboard";
  const shouldOmitExpanded = open2 && openedByKeyboard && parts_exports.screenReader.voiceOver;
  const submenuKeyDownProps = submenuRootContext?.onTriggerKeyDown ? {
    onKeyDown: submenuRootContext.onTriggerKeyDown
  } : void 0;
  const element = useRenderElement("div", componentProps, {
    state,
    stateAttributesMapping: triggerOpenStateMapping,
    props: [
      localInteractionProps,
      hoverProps,
      rootTriggerProps,
      // MenuFilterSubmenuRoot overrides the generic trigger handler because entry and exit
      // depend on both the parent and child menu orientations.
      submenuKeyDownProps,
      itemProps,
      // Opening a submenu changes the trigger's expanded state while the trigger still holds
      // focus, and VoiceOver announces that state change instead of the submenu item that focus
      // moves to a moment later, so the first item is never announced. Dropping the state while
      // the submenu is open avoids the announcement without claiming the submenu is collapsed;
      // `aria-haspopup` still conveys that the item opens a submenu.
      shouldOmitExpanded ? VOICE_OVER_EXPANDED_PROPS : void 0,
      {
        "aria-controls": popupId,
        // A virtually focused parent keeps real focus on its input, so the trigger must stay out
        // of the tab order.
        tabIndex: parentVirtualFocus || !(open2 || highlighted) ? -1 : 0,
        onFocus(event) {
          if (store.select("open") && focusReturnedThroughGuardRef.current) {
            focusReturnedThroughGuardRef.current = false;
            store.setOpen(false, createChangeEventDetails(reason_parts_exports.focusOut, event.nativeEvent));
          }
        },
        onBlur() {
          if (highlighted) {
            parentMenuStore.setActiveIndex(null, reason_parts_exports.none);
          }
        }
      },
      elementProps,
      // `getItemProps` stays last so `useButton` keeps gating consumer handlers while disabled.
      getItemProps
    ],
    ref: [forwardedRef, listItem.ref, itemRef, registerTrigger, handleTriggerElementRef]
  });
  return element;
});
if (false) MenuSubmenuTriggerPlain.displayName = "MenuSubmenuTriggerPlain";
var MenuSubmenuTrigger = /* @__PURE__ */ forwardRef(function MenuSubmenuTrigger2(props, forwardedRef) {
  const filterItem = useMenuFilterItem(props, forwardedRef, "submenu-trigger");
  if (!filterItem.visible) {
    return null;
  }
  const mergedProps = filterItem.props ? mergeProps(filterItem.props, props) : props;
  return /* @__PURE__ */ jsx(MenuSubmenuTriggerPlain, {
    ...mergedProps,
    ref: filterItem.ref
  });
});
if (false) MenuSubmenuTrigger.displayName = "MenuSubmenuTrigger";

// node_modules/@base-ui/react/menu/store/MenuHandle.mjs
var MenuHandle = class extends BasePopupHandle {
  constructor() {
    super(createNullMenuStore(), "Menu");
  }
  /**
   * Opens the menu and associates it with the trigger with the given id.
   *
   * This method should only be called in an event handler or an effect (not during rendering).
   *
   * @param triggerId ID of the trigger to associate with the menu. The trigger must be a matching
   * `Menu.Trigger` with this handle passed as a prop.
   */
  open(triggerId) {
    this.openByTrigger(triggerId);
  }
  /**
   * Closes the menu.
   *
   * This method should only be called in an event handler or an effect (not during rendering).
   */
  close() {
    this.closePopup();
  }
  /**
   * Whether the menu is currently open. Returns `false` while no root is attached to the handle.
   */
  get isOpen() {
    return this.attachedStore?.select("open") ?? false;
  }
};
function createMenuHandle() {
  return new MenuHandle();
}

// node_modules/@base-ui/react/menu/filter-provider/MenuFilterProvider.mjs
init_react();

// node_modules/@base-ui/react/menu/filter-root/MenuFilterRoot.mjs
init_react();

// node_modules/@base-ui/react/menu/filter-root/MenuFilterDropdown.mjs
init_react();

// node_modules/@base-ui/react/filter-dropdown/root/FilterDropdownRoot.mjs
init_react();

// node_modules/@base-ui/utils/stringifyLocale.mjs
function stringifyLocale(locale) {
  if (Array.isArray(locale)) {
    return locale.map((value) => stringifyLocale(value)).join(",");
  }
  if (locale == null) {
    return "";
  }
  return String(locale);
}

// node_modules/@base-ui/react/internals/resolveValueLabel.mjs
init_react();

// node_modules/@base-ui/react/internals/serializeValue.mjs
function serializeValue(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// node_modules/@base-ui/react/internals/resolveValueLabel.mjs
function stringifyAsLabel(item, itemToStringLabel) {
  if (itemToStringLabel && item != null) {
    return itemToStringLabel(item) ?? "";
  }
  if (item && typeof item === "object") {
    if ("label" in item && item.label != null) {
      return String(item.label);
    }
    if ("value" in item) {
      return String(item.value);
    }
  }
  return serializeValue(item);
}

// node_modules/@base-ui/react/internals/filter.mjs
var filterCache = /* @__PURE__ */ new Map();
function getFilter(options = {}) {
  const {
    locale,
    ...restOptions
  } = options;
  const collatorOptions = {
    usage: "search",
    sensitivity: "base",
    ignorePunctuation: true,
    ...restOptions
  };
  const cacheKey = `${stringifyLocale(locale)}|${JSON.stringify(collatorOptions)}`;
  const cachedFilter = filterCache.get(cacheKey);
  if (cachedFilter) {
    return cachedFilter;
  }
  const collator = new Intl.Collator(locale, collatorOptions);
  const filter = {
    contains(item, query, itemToString) {
      if (!query) {
        return true;
      }
      const itemString = stringifyAsLabel(item, itemToString);
      for (let i = 0; i <= itemString.length - query.length; i += 1) {
        if (collator.compare(itemString.slice(i, i + query.length), query) === 0) {
          return true;
        }
      }
      return false;
    },
    startsWith(item, query, itemToString) {
      if (!query) {
        return true;
      }
      const itemString = stringifyAsLabel(item, itemToString);
      return collator.compare(itemString.slice(0, query.length), query) === 0;
    },
    endsWith(item, query, itemToString) {
      if (!query) {
        return true;
      }
      const itemString = stringifyAsLabel(item, itemToString);
      const queryLength = query.length;
      return itemString.length >= queryLength && collator.compare(itemString.slice(itemString.length - queryLength), query) === 0;
    }
  };
  filterCache.set(cacheKey, filter);
  return filter;
}

// node_modules/@base-ui/react/internals/useItemRegistry.mjs
init_react();
function useItemRegistry() {
  const itemRegistry = useRefWithInit(() => /* @__PURE__ */ new Map()).current;
  const [registryVersion, setRegistryVersion] = useState(0);
  const isUpdateScheduledRef = useRef(false);
  const scheduleRegistryUpdate = useStableCallback(() => {
    if (isUpdateScheduledRef.current) {
      return;
    }
    isUpdateScheduledRef.current = true;
    setRegistryVersion((version3) => version3 + 1);
  });
  const registerItem = useStableCallback((key, item) => {
    itemRegistry.set(key, item);
    scheduleRegistryUpdate();
    return () => {
      itemRegistry.delete(key);
      scheduleRegistryUpdate();
    };
  });
  const registeredItems = useMemo(
    () => new Map(itemRegistry),
    // The mutable registry is stable. Its version explicitly controls when to publish a copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registryVersion]
  );
  useIsoLayoutEffect(() => {
    isUpdateScheduledRef.current = false;
  }, [registryVersion]);
  return {
    items: registeredItems,
    registerItem,
    liveItems: itemRegistry
  };
}

// node_modules/@base-ui/react/filter-dropdown/root/FilterDropdownRootContext.mjs
init_react();
function throwMissingFilterRoot() {
  throw new Error(false ? "Base UI: Filter parts are missing their filter context and cannot access the query or items. Wrap the component root in its filter provider." : formatErrorMessage_default(103));
}
var FilterDropdownItemContext = /* @__PURE__ */ createContext(null);
if (false) FilterDropdownItemContext.displayName = "FilterDropdownItemContext";
function useFilterDropdownItemContext(optional = false) {
  const context = useContext(FilterDropdownItemContext);
  if (context === null && !optional) {
    throwMissingFilterRoot();
  }
  return context;
}
var FilterDropdownRootContext = /* @__PURE__ */ createContext(null);
if (false) FilterDropdownRootContext.displayName = "FilterDropdownRootContext";
function useFilterDropdownRootContext(optional = false) {
  const context = useContext(FilterDropdownRootContext);
  if (context === null && !optional) {
    throwMissingFilterRoot();
  }
  return context;
}
function useFilterContextForList(listRef) {
  let context = useContext(FilterDropdownItemContext);
  if (listRef === null) {
    return null;
  }
  while (context !== null && context.listRef !== listRef) {
    context = context.parent;
  }
  return context;
}
var FilterDropdownValueContext = /* @__PURE__ */ createContext("");
if (false) FilterDropdownValueContext.displayName = "FilterDropdownValueContext";
function useFilterDropdownValueContext() {
  return useContext(FilterDropdownValueContext);
}

// node_modules/@base-ui/react/filter-dropdown/store.mjs
var selectors3 = {
  // A null `visibleItemIds` means no query, so fall back to whether anything registered.
  isEmpty: (state) => state.visibleItemIds === null ? state.registeredItemCount === 0 : state.visibleItemIds.size === 0,
  isItemVisible: (state, id) => state.visibleItemIds === null || state.visibleItemIds.has(id)
};
var FilterDropdownStore = class extends ReactStore {
  constructor() {
    super({
      visibleItemIds: null,
      registeredItemCount: 0
    }, EMPTY_OBJECT, selectors3);
  }
};
var DETACHED_OWNER = {
  registerItem: () => NOOP,
  store: new FilterDropdownStore()
};

// node_modules/@base-ui/react/filter-dropdown/root/FilterDropdownRoot.mjs
function FilterDropdownRoot(props) {
  const {
    children,
    open: open2,
    disabled: disabled2 = false,
    openedByKeyboard = false,
    locale,
    value,
    query,
    onValueChange,
    filter,
    autoHighlight = false,
    triggerId: triggerIdProp,
    listRef,
    getActiveIndex,
    setActiveIndex,
    focusOwnerRef: focusOwnerRefProp
  } = props;
  const parentItemContext = useContext(FilterDropdownItemContext);
  const [renderedListId, setRenderedListId] = useState(void 0);
  const [inputFocusVisible, setInputFocusVisible] = useState(openedByKeyboard);
  const [keyboardModality, setKeyboardModality] = useState(openedByKeyboard);
  const [previousOpenedByKeyboard, setPreviousOpenedByKeyboard] = useState(openedByKeyboard);
  if (openedByKeyboard !== previousOpenedByKeyboard) {
    setPreviousOpenedByKeyboard(openedByKeyboard);
    setInputFocusVisible(openedByKeyboard);
    setKeyboardModality(openedByKeyboard);
  }
  const {
    items: registeredItems,
    registerItem: registerInRegistry,
    liveItems
  } = useItemRegistry();
  const defaultId = useBaseUiId();
  const store = useRefWithInit(() => new FilterDropdownStore()).current;
  const registerItem = useStableCallback((id, item) => {
    const unregister = registerInRegistry(id, item);
    store.set("registeredItemCount", liveItems.size);
    return () => {
      unregister();
      store.set("registeredItemCount", liveItems.size);
    };
  });
  const fallbackFocusOwnerRef = useRef(null);
  const lastFilterQueryRef = useRef(null);
  const defaultMatchItem = useMemo(() => getFilter({
    locale
  }).contains, [locale]);
  const focusOwnerRef = focusOwnerRefProp ?? fallbackFocusOwnerRef;
  const filterQuery = (query ?? value).trim();
  const matchItem = filterQuery === "" || filter === null ? null : filter ?? defaultMatchItem;
  const autoHighlightEnabled = open2 && (autoHighlight === "always" || autoHighlight && filterQuery !== "");
  const defaultListId = defaultId ? `${defaultId}-list` : void 0;
  const listId = (renderedListId ?? defaultListId) || void 0;
  const triggerId = triggerIdProp || void 0;
  const handleValueChange = useStableCallback((nextValue, eventDetails) => {
    onValueChange?.(nextValue, eventDetails);
    if (!eventDetails.isCanceled && !autoHighlight) {
      setActiveIndex(null);
    }
  });
  const handleItemsChange = useStableCallback((previousItems) => {
    const items = listRef.current;
    const activeIndex = getActiveIndex();
    if (activeIndex != null && items[activeIndex] != null && items[activeIndex] === previousItems[activeIndex]) {
      return;
    }
    setActiveIndex(autoHighlightEnabled && items.length > 0 ? 0 : null);
  });
  useIsoLayoutEffect(() => {
    if (!open2 && query === void 0) {
      return;
    }
    const queryChanged = lastFilterQueryRef.current !== null && lastFilterQueryRef.current !== filterQuery;
    lastFilterQueryRef.current = filterQuery;
    if (matchItem === null) {
      store.set("visibleItemIds", null);
      if (autoHighlightEnabled && liveItems.size > 0) {
        if (queryChanged || getActiveIndex() == null) {
          setActiveIndex(0);
        }
      } else if (filterQuery === "" && queryChanged) {
        setActiveIndex(null);
      }
      return;
    }
    const currentIds = store.state.visibleItemIds;
    if (currentIds === null && liveItems.size === 0) {
      return;
    }
    const nextIds = /* @__PURE__ */ new Set();
    let hasNewMatch = currentIds === null;
    liveItems.forEach(({
      getText
    }, id) => {
      const text = getText();
      if (text != null && matchItem(text, filterQuery)) {
        nextIds.add(id);
        hasNewMatch ||= !currentIds?.has(id);
      }
    });
    if (hasNewMatch || currentIds?.size !== nextIds.size) {
      if (autoHighlightEnabled && nextIds.size > 0) {
        setActiveIndex(0);
      } else if (currentIds !== null || queryChanged) {
        setActiveIndex(null);
      }
      store.set("visibleItemIds", nextIds);
    } else if (autoHighlightEnabled && queryChanged && nextIds.size > 0) {
      setActiveIndex(0);
    }
  }, [open2, query, filterQuery, registeredItems, liveItems, matchItem, autoHighlightEnabled, store, setActiveIndex, getActiveIndex]);
  const contextValue = useMemo(() => ({
    open: open2,
    disabled: disabled2,
    inputFocusVisible,
    setInputFocusVisible,
    keyboardModality,
    setKeyboardModality,
    autoHighlight,
    triggerId,
    defaultListId,
    listId,
    setRenderedListId,
    focusOwnerRef,
    setActiveIndex,
    onItemsChange: handleItemsChange,
    onValueChange: handleValueChange
  }), [open2, disabled2, inputFocusVisible, keyboardModality, autoHighlight, triggerId, defaultListId, listId, focusOwnerRef, setActiveIndex, handleItemsChange, handleValueChange]);
  const itemContextValue = useMemo(() => ({
    parent: parentItemContext,
    store,
    registerItem,
    listRef
  }), [parentItemContext, store, registerItem, listRef]);
  return /* @__PURE__ */ jsx(FilterDropdownItemContext.Provider, {
    value: itemContextValue,
    children: /* @__PURE__ */ jsx(FilterDropdownRootContext.Provider, {
      value: contextValue,
      children: /* @__PURE__ */ jsx(FilterDropdownValueContext.Provider, {
        value: query ?? value,
        children
      })
    })
  });
}

// node_modules/@base-ui/react/filter-dropdown/root/useFilterDropdownCloseQuery.mjs
init_react();
function useFilterDropdownCloseQuery(parameters) {
  const {
    open: open2,
    mounted,
    value,
    onValueChange
  } = parameters;
  const [closeQuery, setCloseQuery] = useState(null);
  const previousOpenRef = useRef(open2);
  useIsoLayoutEffect(() => {
    const wasOpen = previousOpenRef.current;
    previousOpenRef.current = open2;
    if (wasOpen && !open2 && value !== "") {
      setCloseQuery(value);
      onValueChange("", createChangeEventDetails(reason_parts_exports.popupClose));
    } else if ((open2 || !mounted) && closeQuery !== null) {
      setCloseQuery(null);
    }
  }, [open2, mounted, value, closeQuery, onValueChange]);
  return !open2 && closeQuery !== null ? closeQuery : value;
}

// node_modules/@base-ui/react/menu/filter-root/MenuFilterPopup.mjs
init_react();

// node_modules/@base-ui/react/menu/filter-root/useMenuFilterPopup.mjs
init_react();

// node_modules/@base-ui/react/filter-dropdown/utils/refocusOwner.mjs
var refocusing = false;
function refocusOwner(owner) {
  refocusing = true;
  try {
    owner.focus({
      preventScroll: true
    });
  } finally {
    refocusing = false;
  }
}
function isRefocusingOwner() {
  return refocusing;
}

// node_modules/@base-ui/react/menu/filter-root/useMenuFilterPopup.mjs
function useMenuFilterPopup(orientation) {
  const context = useFilterDropdownRootContext();
  const direction = useDirection();
  const {
    focusOwnerRef
  } = context;
  const nestedFocusRef = useRef(null);
  const pointerTypeRef = useRef("mouse");
  function trackPointerType(event) {
    pointerTypeRef.current = event.pointerType || "mouse";
  }
  if (false) {
    useEffect(() => {
      if (context.open && focusOwnerRef.current === null) {
        warn("A filterable menu opened without a <Menu.Input>. Render the input inside <Menu.Popup>, or drop <Menu.FilterProvider> for a menu that does not filter.");
      }
    }, [context.open, focusOwnerRef]);
  }
  function restoreInputFocus(event, enteredTrigger) {
    const focusOwner = focusOwnerRef.current;
    if (!context.open || !focusOwner) {
      return;
    }
    const activeEl = activeElement(ownerDocument(event.currentTarget));
    if (activeEl === focusOwner || contains(event.currentTarget, activeEl)) {
      return;
    }
    let submenuTrigger = null;
    const nearestPopup = event.nativeEvent.composedPath().find((node) => {
      if (!isHTMLElement(node)) {
        return false;
      }
      if (node.getAttribute("role") === "dialog" || node.hasAttribute("data-rootownerid")) {
        return true;
      }
      if (node.hasAttribute("aria-haspopup")) {
        submenuTrigger = node;
      }
      return false;
    });
    if (nearestPopup !== event.currentTarget) {
      return;
    }
    if (nestedFocusRef.current && !(enteredTrigger && submenuTrigger)) {
      return;
    }
    if (enteredTrigger && submenuTrigger && isElement(event.relatedTarget) && contains(submenuTrigger, event.relatedTarget)) {
      return;
    }
    refocusOwner(focusOwner);
  }
  return {
    // The input owns virtual focus.
    "aria-activedescendant": void 0,
    // Not valid on a dialog; the list's implicit orientation is already vertical.
    "aria-orientation": void 0,
    onMouseDown(event) {
      if (getTarget(event.nativeEvent) === event.currentTarget) {
        event.preventDefault();
      }
    },
    onPointerDown: trackPointerType,
    // `pointerover` precedes the compatibility `mouseover`, so a mouse entering right after a tap
    // is recognized before the handoff below.
    onPointerOver: trackPointerType,
    onPointerMove: trackPointerType,
    onMouseMove(event) {
      if (pointerTypeRef.current === "mouse") {
        restoreInputFocus(event, false);
      }
    },
    onMouseOver(event) {
      if (pointerTypeRef.current === "mouse" && nestedFocusRef.current) {
        restoreInputFocus(event, true);
      }
    },
    onFocus(event) {
      const target = getTarget(event.nativeEvent);
      if (target === focusOwnerRef.current) {
        nestedFocusRef.current = null;
      } else if (isHTMLElement(target) && !contains(event.currentTarget, target) && !isRefocusingOwner()) {
        nestedFocusRef.current = target;
      }
      if (context.open && target === event.currentTarget) {
        focusOwnerRef.current?.focus({
          preventScroll: true
        });
      }
    },
    onKeyDown(event) {
      const target = getTarget(event.nativeEvent);
      if (target === focusOwnerRef.current || isTypeableElement(target)) {
        return;
      }
      if (isCrossOrientationCloseKey(event.key, orientation, direction === "rtl", false)) {
        focusOwnerRef.current?.focus({
          preventScroll: true
        });
        event.stopPropagation();
      }
    }
  };
}

// node_modules/@base-ui/react/menu/filter-root/MenuFilterPopup.mjs
var MenuFilterPopup = /* @__PURE__ */ forwardRef(function MenuFilterPopup2(props, forwardedRef) {
  const {
    store,
    orientation
  } = useMenuRootContext();
  const open2 = store.useState("open");
  const parent = store.useState("parent");
  const openMethod = store.useState("openMethod");
  const lastOpenChangeReason = store.useState("lastOpenChangeReason");
  const interactionProps = useMenuFilterPopup(orientation);
  const openedByHover = open2 && lastOpenChangeReason === reason_parts_exports.triggerHover;
  const mayFocusInput = parent.type !== "menu" || open2 && (openMethod === "keyboard" || lastOpenChangeReason === reason_parts_exports.listNavigation || lastOpenChangeReason === reason_parts_exports.triggerHover || lastOpenChangeReason === reason_parts_exports.triggerPress);
  let initialFocus = false;
  if (mayFocusInput) {
    initialFocus = () => {
      const touchOpen = (openMethod === "touch" || openMethod === "pen") && !store.context.virtualPress;
      if (openedByHover || touchOpen) {
        return false;
      }
      return store.context.virtualFocusRef?.current ?? false;
    };
  }
  const popupProps = mergeProps(interactionProps, props);
  return /* @__PURE__ */ jsx(MenuPopupPlain, {
    ...popupProps,
    role: "dialog",
    initialFocus,
    ref: forwardedRef
  });
});
if (false) MenuFilterPopup.displayName = "MenuFilterPopup";

// node_modules/@base-ui/react/menu/filter-root/MenuFilterList.mjs
init_react();

// node_modules/@base-ui/react/filter-dropdown/list/FilterDropdownList.mjs
init_react();

// node_modules/@base-ui/react/filter-dropdown/group/FilterDropdownGroupContext.mjs
init_react();
var FilterDropdownGroupContext = /* @__PURE__ */ createContext(null);
if (false) FilterDropdownGroupContext.displayName = "FilterDropdownGroupContext";
function useFilterDropdownGroupContext() {
  return useContext(FilterDropdownGroupContext);
}

// node_modules/@base-ui/react/filter-dropdown/list/FilterDropdownList.mjs
var FilterDropdownList = /* @__PURE__ */ forwardRef(function FilterDropdownList2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    id: idProp,
    ...elementProps
  } = componentProps;
  const context = useFilterDropdownRootContext();
  const [id, registerIdRef] = useRenderedId(componentProps, context.defaultListId, context.setRenderedListId);
  const defaultProps = {
    // Chromium includes scrollable elements in sequential focus navigation by default.
    tabIndex: -1,
    id,
    onFocus(event) {
      const owner = context.focusOwnerRef.current;
      if (owner && event.relatedTarget === owner && getTarget(event.nativeEvent) === event.currentTarget) {
        refocusOwner(owner);
      }
    },
    onPointerMove() {
      context.setKeyboardModality(false);
    },
    onPointerDown() {
      context.setKeyboardModality(false);
    }
  };
  return useRenderElement("div", componentProps, {
    ref: [forwardedRef, registerIdRef],
    props: [defaultProps, elementProps, {
      // The list's groups and items belong to this root's query. A nested root's list renders
      // inside an enclosing group, which must not count them as its own members.
      children: /* @__PURE__ */ jsx(FilterDropdownGroupContext.Provider, {
        value: null,
        children: elementProps.children
      })
    }]
  });
});
if (false) FilterDropdownList.displayName = "FilterDropdownList";

// node_modules/@base-ui/react/menu/filter-root/useMenuFilterKeyDown.mjs
function getMenuFilterKeyAction(event, context) {
  const {
    orientation,
    rtl,
    hasActiveItem,
    activeItemOpensSubmenu,
    hasValue
  } = context;
  const {
    key
  } = event;
  if (event.which === 229) {
    return "ignore";
  }
  if (key === "Tab") {
    return event.shiftKey ? "close" : "ignore";
  }
  if (key === "Enter") {
    return hasActiveItem ? "activate" : "navigate";
  }
  const isArrow = key.startsWith("Arrow");
  const isBoundary = key === "Home" || key === "End";
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return isArrow || isBoundary || key.length === 1 ? "edit" : "navigate";
  }
  if (key.length === 1) {
    return "edit";
  }
  if (isBoundary) {
    return hasActiveItem && !hasValue ? "navigate" : "edit";
  }
  if (!isArrow) {
    return "navigate";
  }
  if (isMainOrientationKey(key, orientation)) {
    return orientation === "horizontal" && !hasActiveItem && hasValue ? "edit" : "navigate";
  }
  if (activeItemOpensSubmenu && (isCrossOrientationOpenKey(key, orientation, rtl) || isCrossOrientationCloseKey(key, orientation, rtl, false))) {
    return "submenu";
  }
  if (orientation === "horizontal" && !hasActiveItem) {
    return "enter-list";
  }
  return hasValue ? "edit" : "navigate";
}
function useMenuFilterKeyDown(hasValue) {
  const {
    orientation,
    store
  } = useMenuRootContext();
  const submenuContext = useMenuSubmenuRootContext();
  const direction = useDirection();
  return useStableCallback((event) => {
    if (!store.select("open")) {
      return;
    }
    const activeItem = store.state.highlightedItem;
    const action = getMenuFilterKeyAction(event, {
      orientation,
      rtl: direction === "rtl",
      hasActiveItem: activeItem != null,
      activeItemOpensSubmenu: activeItem?.hasAttribute("aria-haspopup") ?? false,
      hasValue
    });
    switch (action) {
      case "edit":
        event.stopPropagation();
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          store.state.inputProps.onKeyDown?.(event);
        }
        break;
      case "navigate": {
        if (isMainOrientationKey(event.key, orientation)) {
          event.stopPropagation();
        }
        store.state.inputProps.onKeyDown?.(event);
        break;
      }
      case "enter-list": {
        event.stopPropagation();
        const listRef = store.context.itemDomElements;
        const index2 = event.key === "ArrowDown" ? getMinListIndex(listRef, EMPTY_ARRAY) : getMaxListIndex(listRef, EMPTY_ARRAY);
        if (listRef.current[index2]) {
          event.preventDefault();
          store.setActiveIndex(index2, reason_parts_exports.keyboard, event.nativeEvent);
        }
        break;
      }
      case "submenu": {
        stopEvent(event);
        const KeyboardEventConstructor = getWindow(activeItem).KeyboardEvent;
        activeItem.dispatchEvent(new KeyboardEventConstructor(event.type, event.nativeEvent));
        break;
      }
      case "activate":
        event.preventDefault();
        dispatchClickWithModifiers(activeItem, event);
        break;
      case "close": {
        stopEvent(event);
        const returnElement = store.state.parent.type === "menu" && submenuContext?.getReturnElement?.() || store.state.activeTriggerElement;
        const details = createChangeEventDetails(reason_parts_exports.focusOut, event.nativeEvent);
        store.setOpen(false, details);
        if (!details.isCanceled && isHTMLElement(returnElement)) {
          returnElement.focus();
        }
        break;
      }
      default:
        break;
    }
  });
}

// node_modules/@base-ui/react/menu/filter-root/moveHighlightFrom.mjs
function moveHighlightFrom(store, item, event, options) {
  const {
    orientation,
    rtl,
    loopFocus,
    allowEscape
  } = options;
  const listRef = store.context.itemDomElements;
  const items = listRef.current;
  const {
    index: index2
  } = getNextListIndex(items, items.indexOf(item), {
    decrement: !isMainOrientationToEndKey(event.key, orientation, rtl),
    loopFocus,
    allowEscape,
    // Match the menu's list navigation: `aria-disabled` items stay reachable.
    disabledIndices: EMPTY_ARRAY,
    minIndex: getMinListIndex(listRef, EMPTY_ARRAY),
    maxIndex: getMaxListIndex(listRef, EMPTY_ARRAY)
  });
  const next = items[index2];
  if (next) {
    store.setActiveIndex(index2, reason_parts_exports.keyboard, event.nativeEvent);
    next.scrollIntoView?.({
      block: "nearest",
      inline: "nearest"
    });
  }
  return next ?? void 0;
}

// node_modules/@base-ui/react/menu/filter-root/MenuFilterList.mjs
var MenuFilterList = /* @__PURE__ */ forwardRef(function MenuFilterList2(componentProps, forwardedRef) {
  const {
    store,
    orientation,
    loopFocus,
    allowEscape
  } = useMenuRootContext();
  const direction = useDirection();
  const {
    onItemsChange,
    focusOwnerRef,
    triggerId
  } = useFilterDropdownRootContext();
  const {
    listRef
  } = useFilterDropdownItemContext();
  const {
    subscribeMapChange
  } = useCompositeListContext();
  const value = useFilterDropdownValueContext();
  const handleInputKeyDown = useMenuFilterKeyDown(value !== "");
  const handleKeyDown = useStableCallback((event) => {
    const owner = focusOwnerRef.current;
    const target = getTarget(event.nativeEvent);
    const ownerFocused = owner != null && activeElement(ownerDocument(owner)) === owner;
    const fromNestedPopup = !contains(event.currentTarget, target);
    if (owner == null || ownerFocused || fromNestedPopup) {
      if (event.which !== 229 && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && isMainOrientationKey(event.key, orientation)) {
        event.stopPropagation();
        const trigger = fromNestedPopup && ownerFocused ? getNestedPopupTrigger(target) : void 0;
        if (trigger) {
          moveHighlightFrom(store, trigger, event, {
            orientation,
            rtl: direction === "rtl",
            loopFocus,
            allowEscape
          });
        }
      }
      return;
    }
    if (event.defaultPrevented) {
      return;
    }
    refocusOwner(owner);
    handleInputKeyDown(event);
  });
  function getNestedPopupTrigger(target) {
    const root = target.getRootNode();
    return listRef.current.find((item) => {
      const popupId = item?.getAttribute("aria-controls");
      return popupId != null && isHTMLElement(item) && contains(root.getElementById(popupId), target);
    });
  }
  const previousItemsRef = useRef(null);
  const handleItemMapChange = useStableCallback(() => {
    const items = [...listRef.current];
    const previousItems = previousItemsRef.current;
    const changed = previousItems === null || previousItems.length !== items.length || items.some((item, index2) => item !== previousItems[index2]);
    if (changed && previousItems !== null) {
      onItemsChange(previousItems);
    }
    previousItemsRef.current = items;
  });
  useIsoLayoutEffect(() => {
    return subscribeMapChange(handleItemMapChange);
  }, [subscribeMapChange, handleItemMapChange]);
  const ariaLabelledBy = resolvePopupLabel(componentProps, null, triggerId ?? null);
  const listProps = mergeProps({
    role: "menu",
    "aria-labelledby": ariaLabelledBy,
    "aria-orientation": orientation === "horizontal" ? "horizontal" : void 0,
    onKeyDown: handleKeyDown
  }, componentProps);
  return /* @__PURE__ */ jsx(FilterDropdownList, {
    ...listProps,
    ref: forwardedRef
  });
});
if (false) MenuFilterList.displayName = "MenuFilterList";

// node_modules/@base-ui/react/menu/filter-root/MenuFilterGroup.mjs
init_react();

// node_modules/@base-ui/react/filter-dropdown/group/useFilterDropdownGroup.mjs
init_react();
function isGroupHidden(state, items) {
  if (state.visibleItemIds === null || items.size === 0) {
    return false;
  }
  for (const [id, retained] of items) {
    if (retained || state.visibleItemIds.has(id)) {
      return false;
    }
  }
  return true;
}
function useFilterDropdownGroup() {
  const {
    store
  } = useFilterDropdownItemContext();
  const parentContext = useFilterDropdownGroupContext();
  const {
    items,
    registerItem
  } = useItemRegistry();
  const hidden = useStore(store, isGroupHidden, items);
  const groupId = useRefWithInit(() => /* @__PURE__ */ Symbol("filter-dropdown-group")).current;
  const registerInParent = parentContext?.registerItem;
  useIsoLayoutEffect(() => registerInParent?.(groupId, !hidden), [registerInParent, groupId, hidden]);
  const context = useMemo(() => ({
    registerItem
  }), [registerItem]);
  return {
    hidden,
    context
  };
}

// node_modules/@base-ui/react/menu/filter-root/MenuFilterGroup.mjs
var MenuFilterGroup = /* @__PURE__ */ forwardRef(function MenuFilterGroup2(props, forwardedRef) {
  const {
    hidden,
    context
  } = useFilterDropdownGroup();
  return /* @__PURE__ */ jsx(FilterDropdownGroupContext.Provider, {
    value: context,
    children: /* @__PURE__ */ jsx(MenuGroupPlain, {
      ...props,
      hidden: hidden || props.hidden || void 0,
      ref: forwardedRef
    })
  });
});
if (false) MenuFilterGroup.displayName = "MenuFilterGroup";
var MenuFilterRadioGroup = /* @__PURE__ */ forwardRef(function MenuFilterRadioGroup2(props, forwardedRef) {
  const {
    hidden,
    context
  } = useFilterDropdownGroup();
  return /* @__PURE__ */ jsx(FilterDropdownGroupContext.Provider, {
    value: context,
    children: /* @__PURE__ */ jsx(MenuRadioGroupPlain, {
      ...props,
      hidden: hidden || props.hidden || void 0,
      ref: forwardedRef
    })
  });
});
if (false) MenuFilterRadioGroup.displayName = "MenuFilterRadioGroup";

// node_modules/@base-ui/react/filter-dropdown/item/useFilterDropdownItem.mjs
init_react();
function childrenText(children) {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(childrenText).join("");
  }
  if (/* @__PURE__ */ isValidElement(children)) {
    return childrenText(children.props.children);
  }
  return "";
}
function useFilterDropdownItem(params) {
  const {
    label,
    retainGroup = false,
    children,
    render,
    context
  } = params;
  const nearestContext = useFilterDropdownItemContext(context !== void 0);
  const groupContext = useFilterDropdownGroupContext();
  const owner = context === void 0 ? nearestContext : context;
  const {
    registerItem,
    store
  } = owner ?? DETACHED_OWNER;
  const registerGroupItem = groupContext?.registerItem;
  const itemId = useRefWithInit(() => /* @__PURE__ */ Symbol("filter-dropdown-item")).current;
  const ref = useRef(null);
  const registeredTextRef = useRef(void 0);
  const matched = useStore(store, selectors3.isItemVisible, itemId);
  const [registered, setRegistered] = useState(matched);
  const childrenRef = useValueAsRef(children);
  const renderRef = useValueAsRef(render);
  const childrenTextRef = useRef(void 0);
  const resolveText = useCallback(() => {
    if (label != null) {
      return label;
    }
    const fromChildren = childrenText(childrenRef.current ?? unwrapLazyRenderProp(renderRef.current));
    const previousChildrenText = childrenTextRef.current;
    childrenTextRef.current = fromChildren;
    if (ref.current !== null) {
      return ref.current.textContent ?? "";
    }
    if (registeredTextRef.current !== void 0 && fromChildren === previousChildrenText) {
      return registeredTextRef.current;
    }
    return fromChildren;
  }, [label, childrenRef, renderRef]);
  const register2 = useCallback((resolvedText) => {
    const text = resolvedText ?? resolveText();
    if (text) {
      registeredTextRef.current = text;
    }
    return registerItem(itemId, {
      getText() {
        if (label == null && ref.current) {
          registeredTextRef.current = ref.current.textContent ?? "";
        }
        return registeredTextRef.current;
      }
    });
  }, [itemId, label, registerItem, resolveText]);
  useIsoLayoutEffect(() => {
    const unregister = register2();
    setRegistered(true);
    return unregister;
  }, [register2]);
  useIsoLayoutEffect(() => registerGroupItem?.(itemId, retainGroup), [registerGroupItem, itemId, retainGroup]);
  useIsoLayoutEffect(() => {
    const text = resolveText();
    if (text !== registeredTextRef.current) {
      registeredTextRef.current = text;
      void register2(text);
    }
  }, [register2, resolveText, children, render, label]);
  return {
    visible: !registered || matched,
    ref
  };
}

// node_modules/@base-ui/react/menu/filter-root/useMenuFilterSubmenuTrigger.mjs
function useMenuFilterSubmenuTrigger(params) {
  const {
    store,
    virtualFocus
  } = useMenuRootContext();
  const open2 = store.useState("open");
  const mounted = store.useState("mounted");
  const parent = store.useState("parent");
  const parentListRef = parent.type === "menu" ? parent.store.context.itemDomElements : null;
  const parentContext = useFilterContextForList(parentListRef);
  const {
    visible,
    ref
  } = useFilterDropdownItem({
    ...params,
    context: parentContext,
    retainGroup: mounted
  });
  useIsoLayoutEffect(() => {
    if (visible || !open2) {
      return;
    }
    store.setOpen(false, createChangeEventDetails(reason_parts_exports.none));
  }, [visible, open2, store]);
  const clickProps = useEnhancedClickHandler((event, interactionType) => {
    if (event.type === "click" && store.select("open") && (interactionType === "keyboard" || interactionType === "mouse" && store.select("lastOpenChangeReason") === reason_parts_exports.triggerPress)) {
      store.context.virtualFocusRef?.current?.focus({
        preventScroll: true
      });
    }
  });
  const props = {
    // Omitted rather than `undefined`, which would clear the `'menu'` the root puts on every
    // trigger.
    ...virtualFocus ? {
      "aria-haspopup": "dialog"
    } : void 0,
    ...clickProps,
    onPointerDown(event) {
      clickProps.onPointerDown(event);
      store.context.virtualPress = isVirtualPointerEvent(event.nativeEvent);
    },
    onFocus(event) {
      const focusOwner = store.context.virtualFocusRef?.current;
      if (focusOwner && store.select("open") && event.relatedTarget === focusOwner) {
        event.preventBaseUIHandler();
        focusOwner.focus({
          preventScroll: true
        });
      }
    }
  };
  if (parentContext === null) {
    return {
      visible: true,
      ref: null,
      props
    };
  }
  return {
    visible: visible || mounted,
    ref,
    props
  };
}

// node_modules/@base-ui/react/menu/filter-root/useVirtualFocusParentHandoff.mjs
function useVirtualFocusParentHandoff(store, parent, open2, virtualFocus) {
  const parentStore = parent.type === "menu" ? parent.store : null;
  const parentVirtualFocusRef = parentStore?.context.virtualFocusRef;
  const returnToParent = useStableCallback((trigger, reason) => {
    const focusOwner = parentVirtualFocusRef?.current;
    if (virtualFocus || store.select("open") || !parentStore?.select("open") || !focusOwner) {
      return;
    }
    if (contains(store.context.popupRef.current, activeElement(ownerDocument(focusOwner)))) {
      focusOwner.focus({
        preventScroll: true
      });
    }
    if ((reason === reason_parts_exports.listNavigation || reason === reason_parts_exports.escapeKey) && parentStore.state.activeIndex == null) {
      parentStore.highlightItem(trigger, reason_parts_exports.none);
    }
  });
  useIsoLayoutEffect(() => {
    if (!open2) {
      const trigger = store.state.activeTriggerElement;
      const reason = store.select("lastOpenChangeReason");
      queueMicrotask(() => returnToParent(trigger, reason));
    }
  }, [open2, store, returnToParent]);
  function handleFocus() {
    if (!virtualFocus && parentVirtualFocusRef && parentStore?.state.activeIndex != null) {
      parentStore.setActiveIndex(null, reason_parts_exports.none);
    }
  }
  return {
    parentVirtualFocusRef,
    handleFocus
  };
}

// node_modules/@base-ui/react/menu/filter-root/MenuFilterImpl.mjs
var MENU_FILTER_IMPL = {
  Popup: MenuFilterPopup,
  List: MenuFilterList,
  Group: MenuFilterGroup,
  RadioGroup: MenuFilterRadioGroup,
  useItem: useFilterDropdownItem,
  useSubmenuTrigger: useMenuFilterSubmenuTrigger,
  useParentHandoff: useVirtualFocusParentHandoff
};

// node_modules/@base-ui/react/menu/filter-root/MenuFilterDropdown.mjs
function MenuFilterDropdown(props) {
  const {
    value: valueProp,
    defaultValue = "",
    onValueChange,
    ...dropdownProps
  } = props;
  const {
    store
  } = useMenuRootContext();
  const open2 = store.useState("open");
  const mounted = store.useState("mounted");
  const keyboardOpen = store.useState("keyboardOpen");
  const activeTriggerId = store.useState("activeTriggerId");
  const activeTriggerElement = store.useState("activeTriggerElement");
  const disabled2 = store.useState("disabled");
  const [value, setValue] = useControlled({
    controlled: valueProp,
    default: defaultValue,
    name: "MenuFilterProvider",
    state: "value"
  });
  const handleValueChange = useStableCallback((nextValue, eventDetails) => {
    onValueChange?.(nextValue, eventDetails);
    if (!eventDetails.isCanceled) {
      setValue(nextValue);
    }
  });
  const getActiveIndex = useStableCallback(() => store.state.activeIndex);
  const setActiveIndex = useStableCallback((index2) => {
    store.setActiveIndex(index2, reason_parts_exports.none);
  });
  const query = useFilterDropdownCloseQuery({
    open: open2,
    mounted,
    value,
    onValueChange: handleValueChange
  });
  const filterTriggerProps = useFilterTriggerProps(value !== "");
  useRefWithInit(() => {
    store.set("filterTriggerProps", filterTriggerProps);
    return null;
  });
  store.useSyncedValue("filterTriggerProps", filterTriggerProps);
  useIsoLayoutEffect(() => {
    if (!open2) {
      store.set("keyboardOpen", false);
    }
  }, [open2, store]);
  const triggerId = activeTriggerElement ? activeTriggerElement.id || null : activeTriggerId;
  return /* @__PURE__ */ jsx(MenuFilterImplContext.Provider, {
    value: MENU_FILTER_IMPL,
    children: /* @__PURE__ */ jsx(FilterDropdownRoot, {
      ...dropdownProps,
      open: open2,
      openedByKeyboard: keyboardOpen,
      disabled: disabled2,
      value,
      query,
      onValueChange: handleValueChange,
      triggerId,
      listRef: store.context.itemDomElements,
      getActiveIndex,
      setActiveIndex,
      focusOwnerRef: store.context.virtualFocusRef
    })
  });
}
function useFilterTriggerProps(hasValue) {
  const {
    store
  } = useMenuRootContext();
  const isInMenubar = useMenubarContext(true) != null;
  const handleInputKeyDown = useMenuFilterKeyDown(hasValue);
  return useMemo(() => ({
    "aria-haspopup": "dialog",
    onPointerDown(event) {
      store.context.virtualPress = isVirtualPointerEvent(event.nativeEvent);
    },
    onKeyDown(event) {
      const focusOwner = store.context.virtualFocusRef?.current;
      if (!store.select("open") || !focusOwner || isInMenubar) {
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        focusOwner.focus({
          preventScroll: true
        });
        handleInputKeyDown(event);
        event.preventDefault();
        event.preventBaseUIHandler();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventBaseUIHandler();
      } else if (isTypeaheadKey(event)) {
        focusOwner.focus({
          preventScroll: true
        });
      }
    }
  }), [store, isInMenubar, handleInputKeyDown]);
}
function isTypeaheadKey(event) {
  return event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey;
}

// node_modules/@base-ui/react/menu/filter-root/useMenuFilterRoot.mjs
init_react();
function useMenuFilterRoot(props) {
  const {
    children,
    value,
    defaultValue,
    onValueChange,
    filter,
    autoHighlight = false,
    locale,
    ...otherProps
  } = props;
  const virtualFocusRef = useRef(null);
  return {
    children,
    rootProps: {
      ...otherProps,
      virtualFocus: true,
      virtualFocusRef,
      allowEscape: !autoHighlight,
      resetOnPointerLeave: autoHighlight !== "always"
    },
    dropdownProps: {
      value,
      defaultValue,
      onValueChange,
      filter,
      autoHighlight,
      locale
    }
  };
}

// node_modules/@base-ui/react/menu/filter-root/MenuFilterRoot.mjs
function MenuFilterRoot(props) {
  const {
    children,
    rootProps,
    dropdownProps
  } = useMenuFilterRoot(props);
  return /* @__PURE__ */ jsx(MenuRootInternal, {
    ...rootProps,
    children: (payload) => /* @__PURE__ */ jsx(MenuFilterDropdown, {
      ...dropdownProps,
      children: typeof children === "function" ? children(payload) : children
    })
  });
}

// node_modules/@base-ui/react/menu/filter-submenu-root/MenuFilterSubmenuRoot.mjs
init_react();
function MenuFilterSubmenuRoot(props) {
  const parent = useMenuRootContext();
  const parentStore = parent.store;
  const parentDisabled = parentStore.useState("disabled");
  const {
    rootProps,
    dropdownProps
  } = useMenuFilterRoot(props);
  const parentReferenceRef = useRef(null);
  function handleSubmenuEnter(trigger, event) {
    const focusedElement = parent.virtualFocus ? parentStore.context.virtualFocusRef?.current : activeElement(ownerDocument(trigger));
    if (isHTMLElement(focusedElement)) {
      parentReferenceRef.current = {
        reference: focusedElement,
        trigger
      };
      parentStore.setActiveIndex(null, event ? reason_parts_exports.keyboard : reason_parts_exports.none, event);
    }
  }
  function highlightTrigger(trigger, event) {
    parentStore.highlightItem(trigger, reason_parts_exports.keyboard, event);
  }
  function handleSubmenuExit(event) {
    const parentReference = parentReferenceRef.current;
    if (!parentReference) {
      return;
    }
    parentReference.reference.focus({
      preventScroll: true
    });
    highlightTrigger(parentReference.trigger, event);
  }
  function handleOpenChange(nextOpen, details) {
    rootProps.onOpenChange?.(nextOpen, details);
    if (details.isCanceled) {
      return;
    }
    if (!nextOpen) {
      if (details.reason === reason_parts_exports.escapeKey && isHTMLElement(details.trigger)) {
        highlightTrigger(details.trigger, details.event);
        parentReferenceRef.current = {
          reference: parent.virtualFocus ? parentStore.context.virtualFocusRef?.current ?? details.trigger : details.trigger,
          trigger: details.trigger
        };
      }
      return;
    }
    parentReferenceRef.current = null;
    if (isHTMLElement(details.trigger) && isKeyboardOpen(details.reason, details.event)) {
      handleSubmenuEnter(details.trigger, details.reason === reason_parts_exports.listNavigation ? details.event : void 0);
    }
  }
  return /* @__PURE__ */ jsx(MenuRootInternal, {
    ...rootProps,
    isSubmenu: true,
    disabled: parentDisabled || props.disabled,
    onOpenChange: handleOpenChange,
    children: /* @__PURE__ */ jsx(MenuFilterSubmenuNavigation, {
      parentStore,
      parentVirtualFocus: parent.virtualFocus,
      parentAllowEscape: parent.virtualFocus && parent.allowEscape,
      parentOrientation: parent.orientation,
      parentLoopFocus: parent.loopFocus,
      getReturnElement: () => parentReferenceRef.current?.reference ?? (parent.virtualFocus ? parentStore.context.virtualFocusRef?.current : null) ?? null,
      onSubmenuEnter: handleSubmenuEnter,
      onSubmenuExit: handleSubmenuExit,
      children: /* @__PURE__ */ jsx(MenuFilterDropdown, {
        ...dropdownProps,
        children: props.children
      })
    })
  });
}
function MenuFilterSubmenuNavigation(props) {
  const {
    children,
    parentStore,
    parentVirtualFocus,
    parentAllowEscape,
    parentOrientation,
    parentLoopFocus,
    onSubmenuEnter,
    onSubmenuExit,
    getReturnElement
  } = props;
  const {
    store,
    orientation
  } = useMenuRootContext();
  const direction = useDirection();
  const mounted = store.useState("mounted");
  const wasMountedRef = useRef(false);
  const handleReturnFocus = useStableCallback(() => {
    const [ownTrigger] = store.context.triggerElements.elements();
    return getReturnElement() ?? (isHTMLElement(ownTrigger) ? ownTrigger : null);
  });
  useIsoLayoutEffect(() => {
    const wasMounted = wasMountedRef.current;
    wasMountedRef.current = mounted;
    if (mounted || !wasMounted) {
      return;
    }
    const returnElement = handleReturnFocus();
    if (!returnElement || !parentStore.select("open")) {
      return;
    }
    const doc = ownerDocument(returnElement);
    const activeEl = activeElement(doc);
    if (activeEl === doc.body || contains(store.select("popupElement"), activeEl)) {
      returnElement.focus({
        preventScroll: true
      });
    }
  }, [mounted, store, parentStore, handleReturnFocus]);
  function moveInParent(from, event) {
    const item = moveHighlightFrom(parentStore, from, event, {
      orientation: parentOrientation,
      rtl: direction === "rtl",
      loopFocus: parentLoopFocus,
      allowEscape: parentAllowEscape
    });
    if (!parentVirtualFocus) {
      item?.focus({
        preventScroll: true
      });
    }
  }
  function close(event) {
    if (!store.select("open")) {
      return;
    }
    stopEvent(event);
    const trigger = store.select("activeTriggerElement");
    const eventDetails = createChangeEventDetails(reason_parts_exports.listNavigation, event.nativeEvent);
    store.setOpen(false, eventDetails);
    if (!eventDetails.isCanceled) {
      onSubmenuExit(event.nativeEvent);
    }
    const returnElement = getReturnElement() ?? store.select("activeTriggerElement");
    if (!store.select("open") && isHTMLElement(returnElement) && activeElement(ownerDocument(returnElement)) !== returnElement) {
      returnElement.focus();
    }
    if (!store.select("open") && isHTMLElement(trigger) && isMainOrientationKey(event.key, parentOrientation)) {
      moveInParent(trigger, event);
    }
  }
  const handleTriggerKeyDown = useStableCallback((event) => {
    if (isMainOrientationKey(event.key, parentOrientation)) {
      moveInParent(event.currentTarget, event);
      event.preventBaseUIHandler();
      stopEvent(event);
      return;
    }
    const open2 = store.select("open");
    const isRtl = direction === "rtl";
    const isCloseKey = isCrossOrientationCloseKey(event.key, orientation, isRtl, false);
    if (open2 && isCloseKey) {
      close(event);
      return;
    }
    const isOpenKey = isCrossOrientationOpenKey(event.key, parentOrientation, isRtl);
    if (!isOpenKey) {
      return;
    }
    stopEvent(event);
    if (open2) {
      onSubmenuEnter(event.currentTarget, event.nativeEvent);
      store.context.virtualFocusRef?.current?.focus({
        preventScroll: true
      });
      return;
    }
    store.setOpen(true, createChangeEventDetails(reason_parts_exports.listNavigation, event.nativeEvent, event.currentTarget));
  });
  const handlePopupKeyDown = useStableCallback((event) => {
    if (event.which === 229) {
      return;
    }
    const isCloseKey = isCrossOrientationCloseKey(event.key, orientation, direction === "rtl", false);
    if (isCloseKey) {
      close(event);
    }
  });
  const contextValue = useMemo(() => ({
    getReturnElement: handleReturnFocus,
    onTriggerKeyDown: handleTriggerKeyDown,
    onPopupKeyDown: handlePopupKeyDown
  }), [handleReturnFocus, handleTriggerKeyDown, handlePopupKeyDown]);
  return /* @__PURE__ */ jsx(MenuSubmenuRootContext.Provider, {
    value: contextValue,
    children
  });
}

// node_modules/@base-ui/react/menu/filter-provider/MenuFilterProvider.mjs
function MenuFilterProvider(props) {
  const {
    children,
    filter,
    value,
    defaultValue,
    onValueChange,
    autoHighlight,
    locale
  } = props;
  const contextValue = useMemo(() => ({
    Root: MenuFilterRoot,
    SubmenuRoot: MenuFilterSubmenuRoot,
    options: {
      filter,
      value,
      defaultValue,
      onValueChange,
      autoHighlight,
      locale
    }
  }), [filter, value, defaultValue, onValueChange, autoHighlight, locale]);
  return /* @__PURE__ */ jsx(MenuFilterProviderContext.Provider, {
    value: contextValue,
    children
  });
}

// node_modules/@base-ui/react/menu/input/MenuInput.mjs
init_react();

// node_modules/@base-ui/react/filter-dropdown/input/FilterDropdownInput.mjs
init_react();
var FilterDropdownInput = /* @__PURE__ */ forwardRef(function FilterDropdownInput2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    id: idProp,
    disabled: disabled2,
    activeItemId,
    navigationProps,
    ...elementProps
  } = componentProps;
  const id = useBaseUiId(idProp);
  const context = useFilterDropdownRootContext();
  const {
    listRef
  } = useFilterDropdownItemContext();
  const value = useFilterDropdownValueContext();
  const [composingValue, setComposingValue] = useState(null);
  const isComposingRef = useRef(false);
  function commitValue(nextValue, nativeEvent) {
    if (!context.open) {
      return;
    }
    const reason = nextValue === "" ? reason_parts_exports.inputClear : reason_parts_exports.inputChange;
    context.onValueChange(nextValue, createChangeEventDetails(reason, nativeEvent));
  }
  const state = {
    highlighted: context.inputFocusVisible && (!context.keyboardModality || activeItemId == null)
  };
  return useRenderElement("input", componentProps, {
    state,
    ref: [forwardedRef, context.focusOwnerRef],
    props: [navigationProps, {
      id,
      type: "text",
      disabled: context.disabled || disabled2,
      "aria-activedescendant": activeItemId,
      role: "searchbox",
      inputMode: "search",
      autoComplete: "off",
      spellCheck: "false",
      autoCorrect: "off",
      autoCapitalize: "none",
      // The aria-autocomplete 'list' value is only valid with `aria-haspopup` so we depend
      // on the searchbox role to communicate affordance, with an input label as fallback
      // https://w3c.github.io/aria/#aria-autocomplete
      "aria-autocomplete": void 0,
      "aria-controls": context.listId,
      value: composingValue ?? value,
      onCompositionStart(event) {
        if (parts_exports.os.android) {
          return;
        }
        isComposingRef.current = true;
        setComposingValue(event.currentTarget.value);
      },
      onCompositionEnd(event) {
        if (!isComposingRef.current) {
          return;
        }
        isComposingRef.current = false;
        setComposingValue(null);
        commitValue(event.currentTarget.value, event.nativeEvent);
      },
      onChange(event) {
        if (isComposingRef.current) {
          setComposingValue(event.currentTarget.value);
          return;
        }
        commitValue(event.currentTarget.value, event.nativeEvent);
      },
      onKeyDown() {
        context.setKeyboardModality(true);
      },
      onPointerDown() {
        context.setKeyboardModality(false);
      },
      onMouseEnter(event) {
        context.setKeyboardModality(false);
        if (context.open) {
          refocusOwner(event.currentTarget);
        }
      },
      onFocus(event) {
        context.setInputFocusVisible(true);
        if (context.autoHighlight === "always" || isRefocusingOwner()) {
          return;
        }
        const from = event.relatedTarget;
        if (from !== null && listRef.current.includes(from)) {
          context.setActiveIndex(null);
        }
      },
      onBlur() {
        context.setInputFocusVisible(false);
      }
    }, elementProps]
  });
});
if (false) FilterDropdownInput.displayName = "FilterDropdownInput";

// node_modules/@base-ui/react/menu/input/MenuInput.mjs
var MenuInput = /* @__PURE__ */ forwardRef(function MenuInput2(componentProps, forwardedRef) {
  useMenuFilterPart("Input");
  const {
    store
  } = useMenuRootContext();
  const value = useFilterDropdownValueContext();
  const {
    onKeyDown,
    ...navigationProps
  } = store.useState("inputProps");
  const activeItemId = store.useState("highlightedItemId");
  const handleKeyDown = useMenuFilterKeyDown(value !== "");
  const handleInputRef = useCallback((input) => {
    store.set("inputFocused", input !== null && activeElement(ownerDocument(input)) === input);
  }, [store]);
  const mergedRefs = useMergedRefs(forwardedRef, handleInputRef);
  const inputProps = mergeProps({
    onKeyDown: handleKeyDown,
    onFocus() {
      store.set("inputFocused", true);
    },
    onBlur() {
      store.set("inputFocused", false);
    }
  }, componentProps);
  return /* @__PURE__ */ jsx(FilterDropdownInput, {
    ...inputProps,
    activeItemId,
    navigationProps,
    ref: mergedRefs
  });
});
if (false) MenuInput.displayName = "MenuInput";

// node_modules/@base-ui/react/menu/list/MenuList.mjs
init_react();
var MenuListPlain = /* @__PURE__ */ forwardRef(function MenuListPlain2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    id: idProp,
    ...elementProps
  } = componentProps;
  const {
    store,
    orientation
  } = useMenuRootContext();
  const activeTriggerId = store.useState("activeTriggerId");
  const activeTriggerElement = store.useState("activeTriggerElement");
  const setListElement = store.useStateSetter("listElement");
  const id = useBaseUiId(idProp);
  const renderedIdRef = useRef(id);
  useIsoLayoutEffect(() => {
    if (renderedIdRef.current !== id) {
      renderedIdRef.current = id;
      store.notifyAll();
    }
  }, [id, store]);
  const ariaLabelledBy = resolvePopupLabel(componentProps, activeTriggerElement, activeTriggerId);
  return useRenderElement("div", componentProps, {
    ref: [forwardedRef, setListElement],
    props: [{
      id,
      role: "menu",
      // The popup focuses the list on a pointer open in place of itself.
      tabIndex: -1,
      // `menu` is implicitly vertical, so only the non-default value needs to be rendered.
      "aria-orientation": orientation === "horizontal" ? "horizontal" : void 0,
      "aria-labelledby": ariaLabelledBy
    }, elementProps]
  });
});
if (false) MenuListPlain.displayName = "MenuListPlain";
var MenuList = /* @__PURE__ */ forwardRef(function MenuList2(props, forwardedRef) {
  const List = useMenuFilterImpl()?.List ?? MenuListPlain;
  return /* @__PURE__ */ jsx(List, {
    ...props,
    ref: forwardedRef
  });
});
if (false) MenuList.displayName = "MenuList";

// node_modules/@base-ui/react/menu/clear/MenuClear.mjs
init_react();

// node_modules/@base-ui/react/filter-dropdown/clear/FilterDropdownClear.mjs
init_react();
var FilterDropdownClear = /* @__PURE__ */ forwardRef(function FilterDropdownClear2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    disabled: disabledProp = false,
    nativeButton = true,
    ...elementProps
  } = componentProps;
  const context = useFilterDropdownRootContext();
  const value = useFilterDropdownValueContext();
  const disabled2 = context.disabled || disabledProp;
  const visible = value !== "";
  const {
    buttonRef,
    getButtonProps
  } = useButton({
    disabled: disabled2,
    native: nativeButton
  });
  const state = {
    disabled: disabled2
  };
  return useRenderElement("button", componentProps, {
    enabled: visible,
    state,
    ref: [forwardedRef, buttonRef],
    props: [{
      tabIndex: -1,
      "aria-hidden": true,
      onMouseDown(event) {
        event.preventDefault();
      },
      onClick(event) {
        const eventDetails = createChangeEventDetails(reason_parts_exports.clearPress, event.nativeEvent);
        context.onValueChange("", eventDetails);
        context.focusOwnerRef.current?.focus({
          preventScroll: true
        });
      }
    }, elementProps, getButtonProps]
  });
});
if (false) FilterDropdownClear.displayName = "FilterDropdownClear";

// node_modules/@base-ui/react/menu/clear/MenuClear.mjs
var MenuClear = /* @__PURE__ */ forwardRef(function MenuClear2(props, forwardedRef) {
  useMenuFilterPart("Clear");
  return /* @__PURE__ */ jsx(FilterDropdownClear, {
    ...props,
    ref: forwardedRef
  });
});
if (false) MenuClear.displayName = "MenuClear";

// node_modules/@base-ui/react/menu/empty/MenuEmpty.mjs
init_react();

// node_modules/@base-ui/react/filter-dropdown/empty/FilterDropdownEmpty.mjs
init_react();

// node_modules/@base-ui/react/internals/useInitialLiveRegionTextMutation.mjs
init_react();
var LIVE_REGION_MARKER = "\u2060";
var INITIAL_LIVE_REGION_TEXT_MUTATION_RESET_DELAY = 200;
function findLastTextNode(root) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let lastTextNode = null;
  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    if (textNode.nodeValue !== "") {
      lastTextNode = textNode;
    }
  }
  return lastTextNode;
}
function useInitialLiveRegionTextMutation(present = true) {
  const timeout = useTimeout();
  const rootRef = useRef(null);
  useEffect(() => {
    if (!present || parts_exports.os.ios) {
      return void 0;
    }
    const root = rootRef.current;
    if (root == null) {
      return void 0;
    }
    const textNode = findLastTextNode(root);
    if (textNode == null) {
      return void 0;
    }
    const originalValue = textNode.data;
    const markedValue = `${originalValue}${LIVE_REGION_MARKER}`;
    textNode.nodeValue = markedValue;
    timeout.start(INITIAL_LIVE_REGION_TEXT_MUTATION_RESET_DELAY, () => {
      if (textNode.nodeValue === markedValue) {
        textNode.nodeValue = originalValue;
      }
    });
    return () => {
      timeout.clear();
      if (textNode.nodeValue === markedValue) {
        textNode.nodeValue = originalValue;
      }
    };
  }, [present, rootRef, timeout]);
  return rootRef;
}

// node_modules/@base-ui/react/filter-dropdown/empty/FilterDropdownEmpty.mjs
var FilterDropdownEmpty = /* @__PURE__ */ forwardRef(function FilterDropdownEmpty2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useFilterDropdownItemContext();
  const isEmpty = useStore(store, selectors3.isEmpty);
  const [ready, setReady] = useState(false);
  useIsoLayoutEffect(() => {
    setReady(true);
  }, []);
  const visible = ready && isEmpty;
  const emptyRef = useInitialLiveRegionTextMutation(visible);
  return useRenderElement("div", componentProps, {
    enabled: visible,
    ref: [forwardedRef, emptyRef],
    props: [{
      role: "status",
      "aria-live": "polite",
      "aria-atomic": true
    }, elementProps]
  });
});
if (false) FilterDropdownEmpty.displayName = "FilterDropdownEmpty";

// node_modules/@base-ui/react/menu/empty/MenuEmpty.mjs
var MenuEmpty = /* @__PURE__ */ forwardRef(function MenuEmpty2(props, forwardedRef) {
  useMenuFilterPart("Empty");
  return /* @__PURE__ */ jsx(FilterDropdownEmpty, {
    ...props,
    ref: forwardedRef
  });
});
if (false) MenuEmpty.displayName = "MenuEmpty";

// node_modules/@base-ui/react/popover/index.parts.mjs
var index_parts_exports2 = {};
__export(index_parts_exports2, {
  Arrow: () => PopoverArrow,
  Backdrop: () => PopoverBackdrop,
  Close: () => PopoverClose,
  Description: () => PopoverDescription,
  Handle: () => PopoverHandle,
  Popup: () => PopoverPopup,
  Portal: () => PopoverPortal,
  Positioner: () => PopoverPositioner,
  Root: () => PopoverRoot,
  Title: () => PopoverTitle,
  Trigger: () => PopoverTrigger,
  Viewport: () => PopoverViewport,
  createHandle: () => createPopoverHandle
});

// node_modules/@base-ui/react/popover/root/PopoverRoot.mjs
init_react();

// node_modules/@base-ui/react/popover/root/PopoverRootContext.mjs
init_react();
var PopoverRootContext = /* @__PURE__ */ createContext(void 0);
if (false) PopoverRootContext.displayName = "PopoverRootContext";
function usePopoverRootContext(optional) {
  const context = useContext(PopoverRootContext);
  if (context === void 0 && !optional) {
    throw new Error(false ? "Base UI: PopoverRootContext is missing. Popover parts must be placed within <Popover.Root>." : formatErrorMessage_default(47));
  }
  return context;
}

// node_modules/@base-ui/react/popover/store/PopoverStore.mjs
init_react();
var selectors4 = {
  ...popupStoreSelectors,
  disabled: (state) => state.disabled,
  // `trigger-change` describes a popup moving between triggers, which only has
  // meaning while it is open. Dropping it once closed keeps a late or stale
  // restoration from marking a closing popup instant and skipping its exit
  // transition, including on close paths that never reach `setOpen` — a
  // controlled consumer committing `open={false}` goes straight through the prop.
  instantType: (state) => state.instantType === "trigger-change" && !popupStoreSelectors.open(state) ? void 0 : state.instantType,
  openMethod: (state) => state.openMethod,
  openChangeReason: (state) => state.openChangeReason,
  isPressOpenedByTrigger: (state, triggerId) => state.openChangeReason === reason_parts_exports.triggerPress && popupStoreSelectors.isOpenedByTrigger(state, triggerId),
  // The trigger selectors below resolve to a constant for triggers that don't use them, so state
  // changes don't re-render every inactive trigger.
  isTouchPressOpen: (state, openOnHover) => openOnHover && state.openMethod === "touch" && state.openChangeReason === reason_parts_exports.triggerPress,
  hasTriggerFocusGuards: (state, triggerId) => popupStoreSelectors.isOpenedByTrigger(state, triggerId) && !state.focusManagerModal,
  modal: (state) => state.modal,
  titleElementId: (state) => state.titleElementId,
  descriptionElementId: (state) => state.descriptionElementId,
  openOnHover: (state) => state.openOnHover,
  closeDelay: (state) => state.closeDelay,
  adaptiveOrigin: (state) => state.adaptiveOrigin
};
var PopoverStore = class extends ReactStore {
  constructor(initialState, floatingId, nested) {
    const triggerElements = new PopupTriggerMap();
    super(createInitialState2(initialState, triggerElements, floatingId, nested), createInitialContext2(triggerElements), selectors4);
  }
  setOpen = (nextOpen, eventDetails) => {
    const isHover = eventDetails.reason === reason_parts_exports.triggerHover;
    const isKeyboardClick2 = eventDetails.reason === reason_parts_exports.triggerPress && eventDetails.event.detail === 0;
    const isDismissClose = !nextOpen && (eventDetails.reason === reason_parts_exports.escapeKey || eventDetails.reason == null);
    const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(eventDetails);
    const activeTriggerId = this.select("activeTriggerId");
    if (!nextOpen && eventDetails.reason === reason_parts_exports.closePress && eventDetails.trigger == null && activeTriggerId != null) {
      eventDetails.trigger = this.context.triggerElements.getById(activeTriggerId) ?? this.select("activeTriggerElement") ?? void 0;
    }
    this.context.onOpenChange?.(nextOpen, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    this.state.floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);
    const changeState = () => {
      const popupOpenState = createPopupOpenState(this.state, nextOpen, eventDetails.trigger, shouldPreventUnmountOnClose());
      popupOpenState.openChangeReason = eventDetails.reason;
      this.update(popupOpenState);
    };
    if (isHover) {
      this.context.stickIfOpen = true;
      this.context.stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => {
        this.context.stickIfOpen = false;
      });
      flushSync(changeState);
    } else {
      changeState();
    }
    let instantType;
    if (isKeyboardClick2) {
      instantType = "click";
    } else if (isDismissClose) {
      instantType = "dismiss";
    } else if (eventDetails.reason === reason_parts_exports.focusOut) {
      instantType = "focus";
    }
    this.set("instantType", instantType);
  };
};
function createNullPopoverStore() {
  const triggerElements = new PopupTriggerMap();
  const store = new NullStore(Object.freeze(createInitialState2(void 0, triggerElements)), Object.freeze(createInitialContext2(triggerElements)), selectors4);
  return Object.assign(store, {
    setOpen: NOOP
  });
}
function createInitialState2(initialState, triggerElements, floatingId, nested = false) {
  const state = {
    ...createInitialPopupStoreState(triggerElements, floatingId, nested),
    disabled: false,
    modal: false,
    focusManagerModal: false,
    instantType: void 0,
    openMethod: null,
    openChangeReason: null,
    titleElementId: void 0,
    descriptionElementId: void 0,
    openOnHover: false,
    closeDelay: 0,
    adaptiveOrigin: void 0,
    ...initialState
  };
  if (state.open && initialState?.mounted === void 0) {
    state.mounted = true;
  }
  return state;
}
function createInitialContext2(triggerElements) {
  return {
    popupRef: /* @__PURE__ */ createRef(),
    onOpenChange: void 0,
    onOpenChangeComplete: void 0,
    triggerFocusTargetRef: /* @__PURE__ */ createRef(),
    beforeTriggerFocusGuardRef: /* @__PURE__ */ createRef(),
    beforeContentFocusGuardRef: /* @__PURE__ */ createRef(),
    stickIfOpenTimeout: new Timeout(),
    stickIfOpen: true,
    triggerElements
  };
}

// node_modules/@base-ui/react/popover/root/PopoverRoot.mjs
var PopoverRootComponent = fastComponent(function PopoverRootComponent2({
  props
}) {
  const {
    children,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    onOpenChangeComplete,
    modal = false,
    handle,
    triggerId: triggerIdProp,
    defaultTriggerId: defaultTriggerIdProp = null
  } = props;
  const store = usePopoverRootStore(handle, {
    modal,
    open: defaultOpen,
    openProp,
    activeTriggerId: defaultTriggerIdProp,
    triggerIdProp
  });
  store.useControlledProp("openProp", openProp);
  store.useControlledProp("triggerIdProp", triggerIdProp);
  const open2 = store.useState("open");
  const mounted = store.useState("mounted");
  const payload = store.useState("payload");
  store.useContextCallback("onOpenChange", onOpenChange);
  store.useContextCallback("onOpenChangeComplete", onOpenChangeComplete);
  usePopupRootSync(store, open2);
  useImplicitActiveTrigger(store);
  const {
    forceUnmount
  } = useOpenStateTransitions(open2, store, () => {
    store.context.stickIfOpen = true;
    store.set("openChangeReason", null);
  });
  store.useSyncedValues({
    modal
  });
  useEffect(() => {
    if (!open2) {
      store.context.stickIfOpenTimeout.clear();
    }
  }, [store, open2]);
  useImperativeHandle(props.actionsRef, () => ({
    unmount: forceUnmount,
    close: () => store.setOpen(false, createChangeEventDetails(reason_parts_exports.imperativeAction))
  }), [forceUnmount, store]);
  const shouldRenderInteractions = open2 || mounted || handle != null;
  return /* @__PURE__ */ jsxs(PopoverRootContext.Provider, {
    value: store,
    children: [handle && /* @__PURE__ */ jsx(PopupHandleAttachment, {
      handle,
      store
    }), shouldRenderInteractions && /* @__PURE__ */ jsx(PopoverInteractions, {
      store,
      modal
    }), typeof children === "function" ? children({
      payload
    }) : children]
  });
});
if (false) PopoverRootComponent.displayName = "PopoverRootComponent";
function PopoverRoot(props) {
  if (usePopoverRootContext(true)) {
    return /* @__PURE__ */ jsx(PopoverRootComponent, {
      props
    });
  }
  return /* @__PURE__ */ jsx(FloatingTree, {
    children: /* @__PURE__ */ jsx(PopoverRootComponent, {
      props
    })
  });
}
function usePopoverRootStore(handle, initialState) {
  const store = usePopupRootStore((floatingId, nested) => new PopoverStore(initialState, floatingId, nested));
  useEffect(() => store.context.stickIfOpenTimeout.disposeEffect(), [store]);
  return store;
}
function PopoverInteractions({
  store,
  modal
}) {
  const floatingRootContext = store.useState("floatingRootContext");
  const dismiss = useDismiss(floatingRootContext, {
    outsidePressEvent: {
      // Ensure `aria-hidden` on outside elements is removed immediately
      // on outside press when trapping focus.
      mouse: modal === "trap-focus" ? "sloppy" : "intentional",
      touch: "sloppy"
    }
  });
  const triggerProps = dismiss.reference;
  const popupProps = dismiss.floating;
  usePopupInteractionProps(store, {
    activeTriggerProps: triggerProps,
    inactiveTriggerProps: triggerProps,
    popupProps
  });
  return null;
}

// node_modules/@base-ui/react/popover/trigger/PopoverTrigger.mjs
init_react();

// node_modules/@base-ui/react/popover/utils/constants.mjs
var OPEN_DELAY = 300;

// node_modules/@base-ui/react/popover/trigger/PopoverTrigger.mjs
var PopoverTrigger = fastComponentRef(function PopoverTrigger2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    disabled: disabled2 = false,
    nativeButton = true,
    handle,
    payload,
    openOnHover = false,
    delay = OPEN_DELAY,
    closeDelay = 0,
    id: idProp,
    ...elementProps
  } = componentProps;
  const rootStore = usePopoverRootContext(true);
  const handleStore = usePopupHandleStore(handle);
  const store = handleStore ?? rootStore;
  if (!store) {
    throw new Error(false ? "Base UI: <Popover.Trigger> must be either used within a <Popover.Root> component or provided with a handle." : formatErrorMessage_default(74));
  }
  const thisTriggerId = useBaseUiId(idProp);
  const isTriggerActive = store.useState("isTriggerActive", thisTriggerId);
  const floatingContext = store.useState("floatingRootContext");
  const isOpenedByThisTrigger = store.useState("isOpenedByTrigger", thisTriggerId);
  const popupId = store.useState("triggerPopupId", thisTriggerId);
  const triggerElementRef = useRef(null);
  const {
    registerTrigger,
    isMountedByThisTrigger
  } = useTriggerDataForwarding(thisTriggerId, triggerElementRef, store, {
    payload,
    disabled: disabled2,
    openOnHover,
    closeDelay
  });
  const isPressOpenedByThisTrigger = store.useState("isPressOpenedByTrigger", thisTriggerId);
  const isTouchPressOpen = store.useState("isTouchPressOpen", openOnHover);
  const hasFocusGuards = store.useState("hasTriggerFocusGuards", thisTriggerId);
  const hoverProps = useHoverReferenceInteraction(floatingContext, {
    enabled: !disabled2 && openOnHover && !isTouchPressOpen,
    mouseOnly: true,
    move: false,
    handleClose: safePolygon(),
    restMs: delay,
    delay: {
      close: closeDelay
    },
    triggerElementRef,
    isActiveTrigger: isTriggerActive,
    isClosing: () => store.select("transitionStatus") === "ending"
  });
  const getStickIfOpen = useStableCallback(() => store.context.stickIfOpen);
  const click = useClick(floatingContext, {
    stickIfOpen: getStickIfOpen
  });
  const interactionTypeProps = useOpenMethodTriggerProps(() => store.select("open"), (interactionType) => {
    store.set("openMethod", interactionType);
  });
  const rootTriggerProps = store.useState("triggerProps", isMountedByThisTrigger);
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled: disabled2,
    native: nativeButton
  });
  const stateAttributesMapping2 = {
    open(value) {
      if (isPressOpenedByThisTrigger) {
        return pressableTriggerOpenStateMapping.open(value);
      }
      return triggerOpenStateMapping.open(value);
    }
  };
  const {
    handlePreFocusGuardFocus,
    handleFocusTargetFocus
  } = useTriggerFocusGuards(store, triggerElementRef);
  const state = {
    disabled: disabled2,
    open: isOpenedByThisTrigger
  };
  const element = useRenderElement("button", componentProps, {
    state,
    ref: [buttonRef, forwardedRef, registerTrigger, triggerElementRef],
    props: [click.reference, hoverProps, rootTriggerProps, interactionTypeProps, {
      [CLICK_TRIGGER_IDENTIFIER]: "",
      id: thisTriggerId,
      "aria-haspopup": "dialog",
      "aria-expanded": isOpenedByThisTrigger,
      "aria-controls": popupId
    }, elementProps, getButtonProps],
    stateAttributesMapping: stateAttributesMapping2
  });
  const keyedElement = /* @__PURE__ */ jsx(Fragment, {
    children: element
  }, thisTriggerId);
  if (hasFocusGuards) {
    return /* @__PURE__ */ jsxs(Fragment, {
      children: [/* @__PURE__ */ jsx(FocusGuard, {
        ref: store.context.beforeTriggerFocusGuardRef,
        onFocus: handlePreFocusGuardFocus
      }), keyedElement, /* @__PURE__ */ jsx(FocusGuard, {
        ref: store.context.triggerFocusTargetRef,
        onFocus: handleFocusTargetFocus
      })]
    });
  }
  return keyedElement;
});
if (false) PopoverTrigger.displayName = "PopoverTrigger";

// node_modules/@base-ui/react/popover/portal/PopoverPortal.mjs
init_react();

// node_modules/@base-ui/react/popover/portal/PopoverPortalContext.mjs
init_react();
var PopoverPortalContext = /* @__PURE__ */ createContext(void 0);
if (false) PopoverPortalContext.displayName = "PopoverPortalContext";
function usePopoverPortalContext() {
  const value = useContext(PopoverPortalContext);
  if (value === void 0) {
    throw new Error(false ? "Base UI: <Popover.Portal> is missing." : formatErrorMessage_default(45));
  }
  return value;
}

// node_modules/@base-ui/react/popover/portal/PopoverPortal.mjs
var PopoverPortal = /* @__PURE__ */ forwardRef(function PopoverPortal2(props, forwardedRef) {
  const {
    keepMounted = false,
    ...portalProps
  } = props;
  const store = usePopoverRootContext();
  const mounted = store.useState("mounted");
  const shouldRender = mounted || keepMounted;
  if (!shouldRender) {
    return null;
  }
  return /* @__PURE__ */ jsx(PopoverPortalContext.Provider, {
    value: keepMounted,
    children: /* @__PURE__ */ jsx(FloatingPortal, {
      ref: forwardedRef,
      ...portalProps
    })
  });
});
if (false) PopoverPortal.displayName = "PopoverPortal";

// node_modules/@base-ui/react/popover/positioner/PopoverPositioner.mjs
init_react();

// node_modules/@base-ui/react/popover/positioner/PopoverPositionerContext.mjs
init_react();
var PopoverPositionerContext = /* @__PURE__ */ createContext(void 0);
if (false) PopoverPositionerContext.displayName = "PopoverPositionerContext";
function usePopoverPositionerContext() {
  const context = useContext(PopoverPositionerContext);
  if (!context) {
    throw new Error(false ? "Base UI: PopoverPositionerContext is missing. PopoverPositioner parts must be placed within <Popover.Positioner>." : formatErrorMessage_default(46));
  }
  return context;
}

// node_modules/@base-ui/react/popover/positioner/PopoverPositioner.mjs
var PopoverPositioner = /* @__PURE__ */ forwardRef(function PopoverPositioner2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    anchor,
    // `useAnchorPositioning` applies the same defaults to the undefined values; the names
    // remain destructured to exclude the props from `elementProps`.
    positionMethod,
    side,
    align,
    sideOffset,
    alignOffset,
    collisionBoundary = "clipping-ancestors",
    collisionPadding,
    arrowPadding,
    sticky,
    disableAnchorTracking = false,
    collisionAvoidance = POPUP_COLLISION_AVOIDANCE,
    ...elementProps
  } = componentProps;
  const store = usePopoverRootContext();
  const keepMounted = usePopoverPortalContext();
  const nodeId = useFloatingNodeId();
  const floatingRootContext = store.useState("floatingRootContext");
  const mounted = store.useState("mounted");
  const open2 = store.useState("open");
  const openReason = store.useState("openChangeReason");
  const triggerElement = store.useState("activeTriggerElement");
  const modal = store.useState("modal");
  const openMethod = store.useState("openMethod");
  const positionerElement = store.useState("positionerElement");
  const instantType = store.useState("instantType");
  const transitionStatus = store.useState("transitionStatus");
  const adaptiveOrigin2 = store.useState("adaptiveOrigin");
  const positioning = useAnchorPositioning({
    anchor,
    floatingRootContext,
    positionMethod,
    mounted,
    side,
    sideOffset,
    align,
    alignOffset,
    arrowPadding,
    collisionBoundary,
    collisionPadding,
    sticky,
    disableAnchorTracking,
    keepMounted,
    nodeId,
    collisionAvoidance,
    adaptiveOrigin: adaptiveOrigin2
  });
  const domReference = floatingRootContext.useState("domReferenceElement");
  useTriggerSwitchTransition({
    store,
    domReference,
    positionerElement,
    open: open2
  });
  const trueModalNonHover = modal === true && openReason !== reason_parts_exports.triggerHover;
  useAnchoredPopupScrollLock(open2 && trueModalNonHover, openMethod === "touch", positionerElement, triggerElement);
  const setPositionerElement = store.useStateSetter("positionerElement");
  const state = {
    open: open2,
    side: positioning.side,
    align: positioning.align,
    anchorHidden: positioning.anchorHidden,
    instant: instantType
  };
  const element = usePositioner(componentProps, state, {
    styles: positioning.positionerStyles,
    transitionStatus,
    props: elementProps,
    refs: [forwardedRef, setPositionerElement],
    hidden: !mounted,
    inert: !open2
  });
  return /* @__PURE__ */ jsxs(PopoverPositionerContext.Provider, {
    value: positioning,
    children: [mounted && trueModalNonHover && /* @__PURE__ */ jsx(InternalBackdrop, {
      inert: inertValue(!open2),
      cutout: triggerElement
    }), /* @__PURE__ */ jsx(FloatingNode, {
      id: nodeId,
      children: element
    })]
  });
});
if (false) PopoverPositioner.displayName = "PopoverPositioner";

// node_modules/@base-ui/react/popover/popup/PopoverPopup.mjs
init_react();

// node_modules/@base-ui/react/utils/closePart.mjs
init_react();
var ClosePartContext = /* @__PURE__ */ createContext(void 0);
if (false) ClosePartContext.displayName = "ClosePartContext";
function useClosePartCount() {
  const [closePartCount, setClosePartCount] = useState(0);
  const register2 = useStableCallback(() => {
    setClosePartCount((count) => count + 1);
    return () => {
      setClosePartCount((count) => Math.max(0, count - 1));
    };
  });
  const context = useMemo(() => ({
    register: register2
  }), [register2]);
  return {
    context,
    hasClosePart: closePartCount > 0
  };
}
function useClosePartRegistration() {
  const context = useContext(ClosePartContext);
  useIsoLayoutEffect(() => {
    return context?.register();
  }, [context]);
}

// node_modules/@base-ui/react/popover/popup/PopoverPopup.mjs
var PopoverPopup = /* @__PURE__ */ forwardRef(function PopoverPopup2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    initialFocus,
    finalFocus,
    ...elementProps
  } = componentProps;
  const store = usePopoverRootContext();
  const positioner = usePopoverPositionerContext();
  const insideToolbar = useToolbarRootContext(true) != null;
  const {
    context: closePartContext,
    hasClosePart
  } = useClosePartCount();
  const open2 = store.useState("open");
  const openMethod = store.useState("openMethod");
  const instantType = store.useState("instantType");
  const transitionStatus = store.useState("transitionStatus");
  const popupProps = store.useState("popupProps");
  const titleId = store.useState("titleElementId");
  const descriptionId = store.useState("descriptionElementId");
  const modal = store.useState("modal");
  const mounted = store.useState("mounted");
  const openReason = store.useState("openChangeReason");
  const activeTriggerElement = store.useState("activeTriggerElement");
  const floatingContext = store.useState("floatingRootContext");
  const floatingId = floatingContext.useState("floatingId");
  const disabled2 = store.useState("disabled");
  const openOnHover = store.useState("openOnHover");
  const closeDelay = store.useState("closeDelay");
  useOpenChangeComplete({
    open: open2,
    ref: store.context.popupRef,
    onComplete() {
      if (open2) {
        store.context.onOpenChangeComplete?.(true);
      }
    }
  });
  useHoverFloatingInteraction(floatingContext, {
    enabled: openOnHover && !disabled2,
    closeDelay
  });
  const resolvedInitialFocus = initialFocus === void 0 ? createDefaultInitialFocus(store.context.popupRef) : initialFocus;
  const focusManagerModal = modal !== false && hasClosePart;
  store.useSyncedValue("focusManagerModal", focusManagerModal);
  const setPopupElement = store.useStateSetter("popupElement");
  const state = {
    open: open2,
    side: positioner.side,
    align: positioner.align,
    instant: instantType,
    transitionStatus
  };
  const element = useRenderElement("div", componentProps, {
    state,
    ref: [forwardedRef, store.context.popupRef, setPopupElement],
    props: [popupProps, {
      id: floatingId,
      role: "dialog",
      ...FOCUSABLE_POPUP_PROPS,
      "aria-labelledby": titleId,
      "aria-describedby": descriptionId,
      onKeyDown(event) {
        if (insideToolbar && COMPOSITE_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      }
    }, getDisabledMountTransitionStyles(transitionStatus), elementProps],
    stateAttributesMapping: popupTransitionStateMapping
  });
  return /* @__PURE__ */ jsx(FloatingFocusManager, {
    context: floatingContext,
    openInteractionType: openMethod,
    modal: focusManagerModal,
    disabled: !mounted || openReason === reason_parts_exports.triggerHover,
    initialFocus: resolvedInitialFocus,
    returnFocus: finalFocus,
    restoreFocus: "popup",
    getInsideElements: () => [store.context.beforeTriggerFocusGuardRef.current],
    previousFocusableElement: isHTMLElement(activeTriggerElement) ? activeTriggerElement : void 0,
    nextFocusableElement: store.context.triggerFocusTargetRef,
    beforeContentFocusGuardRef: store.context.beforeContentFocusGuardRef,
    children: /* @__PURE__ */ jsx(ClosePartContext.Provider, {
      value: closePartContext,
      children: element
    })
  });
});
if (false) PopoverPopup.displayName = "PopoverPopup";

// node_modules/@base-ui/react/popover/arrow/PopoverArrow.mjs
init_react();
var PopoverArrow = /* @__PURE__ */ forwardRef(function PopoverArrow2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const store = usePopoverRootContext();
  const open2 = store.useState("open");
  const {
    arrowRef,
    side,
    align,
    arrowUncentered,
    arrowStyles
  } = usePopoverPositionerContext();
  const state = {
    open: open2,
    side,
    align,
    uncentered: arrowUncentered
  };
  const element = useRenderElement("div", componentProps, {
    state,
    ref: [forwardedRef, arrowRef],
    props: [{
      style: arrowStyles,
      "aria-hidden": true
    }, elementProps],
    stateAttributesMapping: popupStateMapping
  });
  return element;
});
if (false) PopoverArrow.displayName = "PopoverArrow";

// node_modules/@base-ui/react/popover/backdrop/PopoverBackdrop.mjs
init_react();
var PopoverBackdrop = /* @__PURE__ */ forwardRef(function PopoverBackdrop2(props, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = props;
  const store = usePopoverRootContext();
  const open2 = store.useState("open");
  const mounted = store.useState("mounted");
  const transitionStatus = store.useState("transitionStatus");
  const openReason = store.useState("openChangeReason");
  const state = {
    open: open2,
    transitionStatus
  };
  const element = useRenderElement("div", props, {
    state,
    ref: forwardedRef,
    props: [{
      role: "presentation",
      hidden: !mounted,
      style: {
        pointerEvents: openReason === reason_parts_exports.triggerHover ? "none" : void 0,
        userSelect: "none",
        WebkitUserSelect: "none"
      }
    }, elementProps],
    stateAttributesMapping: popupTransitionStateMapping
  });
  return element;
});
if (false) PopoverBackdrop.displayName = "PopoverBackdrop";

// node_modules/@base-ui/react/popover/title/PopoverTitle.mjs
init_react();
var PopoverTitle = /* @__PURE__ */ forwardRef(function PopoverTitle2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const store = usePopoverRootContext();
  const id = useBaseUiId(elementProps.id);
  store.useSyncedValueWithCleanup("titleElementId", id);
  const element = useRenderElement("h2", componentProps, {
    ref: forwardedRef,
    props: [{
      id
    }, elementProps]
  });
  return element;
});
if (false) PopoverTitle.displayName = "PopoverTitle";

// node_modules/@base-ui/react/popover/description/PopoverDescription.mjs
init_react();
var PopoverDescription = /* @__PURE__ */ forwardRef(function PopoverDescription2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const store = usePopoverRootContext();
  const id = useBaseUiId(elementProps.id);
  store.useSyncedValueWithCleanup("descriptionElementId", id);
  const element = useRenderElement("p", componentProps, {
    ref: forwardedRef,
    props: [{
      id
    }, elementProps]
  });
  return element;
});
if (false) PopoverDescription.displayName = "PopoverDescription";

// node_modules/@base-ui/react/popover/close/PopoverClose.mjs
init_react();
var PopoverClose = /* @__PURE__ */ forwardRef(function PopoverClose2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    disabled: disabled2 = false,
    nativeButton = true,
    ...elementProps
  } = componentProps;
  const {
    buttonRef,
    getButtonProps
  } = useButton({
    disabled: disabled2,
    focusableWhenDisabled: false,
    native: nativeButton
  });
  const store = usePopoverRootContext();
  useClosePartRegistration();
  const element = useRenderElement("button", componentProps, {
    ref: [forwardedRef, buttonRef],
    props: [{
      onClick(event) {
        store.setOpen(false, createChangeEventDetails(reason_parts_exports.closePress, event.nativeEvent));
      }
    }, elementProps, getButtonProps]
  });
  return element;
});
if (false) PopoverClose.displayName = "PopoverClose";

// node_modules/@base-ui/react/popover/viewport/PopoverViewport.mjs
init_react();
var PopoverViewport = /* @__PURE__ */ forwardRef(function PopoverViewport2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    children,
    ...elementProps
  } = componentProps;
  const store = usePopoverRootContext();
  const {
    side
  } = usePopoverPositionerContext();
  const instantType = store.useState("instantType");
  const {
    children: childrenToRender,
    state: viewportState
  } = usePopupViewport({
    store,
    side,
    children
  });
  const state = {
    activationDirection: viewportState.activationDirection,
    transitioning: viewportState.transitioning,
    instant: instantType
  };
  return useRenderElement("div", componentProps, {
    state,
    ref: forwardedRef,
    props: [elementProps, {
      children: childrenToRender
    }],
    stateAttributesMapping: popupViewportStateMapping
  });
});
if (false) PopoverViewport.displayName = "PopoverViewport";

// node_modules/@base-ui/react/popover/store/PopoverHandle.mjs
var PopoverHandle = class extends BasePopupHandle {
  constructor() {
    super(createNullPopoverStore(), "Popover");
  }
  /**
   * Opens the popover and associates it with the trigger with the given id.
   *
   * This method should only be called in an event handler or an effect (not during rendering).
   *
   * @param triggerId ID of the trigger to associate with the popover. The trigger must be a matching
   * `Popover.Trigger` with this handle passed as a prop.
   */
  open(triggerId) {
    this.openByTrigger(triggerId);
  }
  /**
   * Closes the popover.
   *
   * This method should only be called in an event handler or an effect (not during rendering).
   */
  close() {
    this.closePopup();
  }
  /**
   * Whether the popover is currently open. Returns `false` while no root is attached to the handle.
   */
  get isOpen() {
    return this.attachedStore?.select("open") ?? false;
  }
};
function createPopoverHandle() {
  return new PopoverHandle();
}

// node_modules/@base-ui/react/radio/index.parts.mjs
var index_parts_exports3 = {};
__export(index_parts_exports3, {
  Indicator: () => RadioIndicator,
  Root: () => RadioRoot
});

// node_modules/@base-ui/react/radio/root/RadioRoot.mjs
init_react();

// node_modules/@base-ui/react/field/control/FieldControlDataAttributes.mjs
var valid = "data-valid";
var invalid = "data-invalid";

// node_modules/@base-ui/react/internals/field-constants/constants.mjs
var DEFAULT_VALIDITY_STATE = {
  badInput: false,
  customError: false,
  patternMismatch: false,
  rangeOverflow: false,
  rangeUnderflow: false,
  stepMismatch: false,
  tooLong: false,
  tooShort: false,
  typeMismatch: false,
  valid: null,
  valueMissing: false
};
var DEFAULT_FIELD_STATE_ATTRIBUTES = {
  valid: null,
  touched: false,
  dirty: false,
  filled: false,
  focused: false
};
var DEFAULT_FIELD_ROOT_STATE = {
  disabled: false,
  ...DEFAULT_FIELD_STATE_ATTRIBUTES
};
var fieldValidityMapping = {
  valid(value) {
    if (value === null) {
      return null;
    }
    if (value) {
      return {
        [valid]: ""
      };
    }
    return {
      [invalid]: ""
    };
  }
};

// node_modules/@base-ui/react/radio/root/RadioRootDataAttributes.mjs
var checked2 = "data-checked";
var unchecked2 = "data-unchecked";

// node_modules/@base-ui/react/radio/utils/stateAttributesMapping.mjs
var stateAttributesMapping = {
  checked(value) {
    if (value) {
      return {
        [checked2]: ""
      };
    }
    return {
      [unchecked2]: ""
    };
  },
  ...transitionStatusMapping,
  ...fieldValidityMapping
};

// node_modules/@base-ui/react/internals/composite/constants.mjs
var ACTIVE_COMPOSITE_ITEM = "data-composite-item-active";

// node_modules/@base-ui/react/internals/field-root-context/FieldRootContext.mjs
init_react();
var DEFAULT_FIELD_ROOT_CONTEXT = {
  invalid: void 0,
  name: void 0,
  validityData: {
    state: DEFAULT_VALIDITY_STATE,
    errors: [],
    error: "",
    value: "",
    initialValue: null
  },
  setValidityData: NOOP,
  disabled: void 0,
  setTouched: NOOP,
  setDirty: NOOP,
  setFilled: NOOP,
  setFocused: NOOP,
  focusOwnerRef: {
    current: void 0
  },
  validationMode: "onSubmit",
  shouldValidateOnChange: () => false,
  state: DEFAULT_FIELD_ROOT_STATE,
  registerFieldControl: NOOP,
  validation: {
    getValidationProps: (_disabled, props = EMPTY_OBJECT) => props,
    inputRef: {
      current: null
    },
    registeredInputs: /* @__PURE__ */ new Map(),
    registerInput: NOOP,
    getInputControl: () => null,
    commit: async () => {
    },
    change: NOOP
  }
};
var FieldRootContext = /* @__PURE__ */ createContext(DEFAULT_FIELD_ROOT_CONTEXT);
if (false) FieldRootContext.displayName = "FieldRootContext";
function useFieldRootContext(optional = true) {
  const context = useContext(FieldRootContext);
  if (context.setValidityData === NOOP && !optional) {
    throw new Error(false ? "Base UI: FieldRootContext is missing. Field parts must be placed within <Field.Root>." : formatErrorMessage_default(28));
  }
  return context;
}

// node_modules/@base-ui/react/internals/field-root-context/useSetFieldFocused.mjs
function useSetFieldFocused(disabled2, focusTargetRef, onFocusedChange) {
  const {
    setFocused,
    focusOwnerRef
  } = useFieldRootContext();
  const setFieldFocused = useStableCallback((focused) => {
    if (focused ? !disabled2 : focusOwnerRef.current === setFieldFocused) {
      focusOwnerRef.current = focused && setFieldFocused;
      onFocusedChange?.(focused);
      setFocused(focused);
    }
  });
  useIsoLayoutEffect(() => {
    const el = focusTargetRef.current;
    const root = el?.getRootNode();
    if (root?.activeElement === el) {
      setFieldFocused(true);
    }
    return () => setFieldFocused(false);
  }, [disabled2, focusTargetRef, setFieldFocused]);
  return setFieldFocused;
}

// node_modules/@base-ui/react/field/item/FieldItemContext.mjs
init_react();
var FieldItemContext = /* @__PURE__ */ createContext({
  disabled: false
});
if (false) FieldItemContext.displayName = "FieldItemContext";
function useFieldItemContext() {
  const context = useContext(FieldItemContext);
  return context;
}

// node_modules/@base-ui/react/internals/labelable-provider/LabelableContext.mjs
init_react();
var LabelableContext = /* @__PURE__ */ createContext({
  controlId: void 0,
  registerControlId: NOOP,
  resetControlId: NOOP,
  labelId: void 0,
  setLabelId: NOOP,
  messageIds: [],
  setMessageIds: NOOP,
  getDescriptionProps: (externalProps) => externalProps
});
if (false) LabelableContext.displayName = "LabelableContext";
function useLabelableContext() {
  return useContext(LabelableContext);
}

// node_modules/@base-ui/react/internals/labelable-provider/useAriaLabelledBy.mjs
init_react();
function useAriaLabelledBy(explicitAriaLabelledBy, labelId, labelSourceRef, enableFallback = true, labelSourceId, ariaLabel) {
  const [fallbackAriaLabelledBy, setFallbackAriaLabelledBy] = useState();
  const generatedLabelId = useBaseUiId(labelSourceId ? `${labelSourceId}-label` : void 0);
  const hasAriaLabel = Boolean(ariaLabel?.trim());
  const implicitLabelId = hasAriaLabel ? void 0 : labelId;
  const ariaLabelledBy = explicitAriaLabelledBy ?? implicitLabelId ?? fallbackAriaLabelledBy;
  useIsoLayoutEffect(() => {
    const nextAriaLabelledBy = explicitAriaLabelledBy || labelId || hasAriaLabel || !enableFallback ? void 0 : getAriaLabelledBy(labelSourceRef.current, generatedLabelId);
    if (fallbackAriaLabelledBy !== nextAriaLabelledBy) {
      setFallbackAriaLabelledBy(nextAriaLabelledBy);
    }
  });
  return ariaLabelledBy;
}
function getAriaLabelledBy(labelSource, generatedLabelId) {
  const label = findAssociatedLabel(labelSource);
  if (!label) {
    return void 0;
  }
  if (!label.id && generatedLabelId) {
    label.id = generatedLabelId;
  }
  return label.id || void 0;
}
function findAssociatedLabel(labelSource) {
  if (!labelSource) {
    return void 0;
  }
  const parent = labelSource.parentElement;
  if (parent && parent.tagName === "LABEL") {
    return parent;
  }
  const controlId = labelSource.id;
  if (controlId) {
    const nextSibling = labelSource.nextElementSibling;
    if (nextSibling && nextSibling.htmlFor === controlId) {
      return nextSibling;
    }
  }
  const labels = labelSource.labels;
  return labels && labels[0];
}

// node_modules/@base-ui/react/internals/labelable-provider/useLabelableId.mjs
init_react();
function useLabelableId(params = {}) {
  const {
    id,
    enabled = true
  } = params;
  const {
    controlId,
    registerControlId,
    resetControlId
  } = useLabelableContext();
  const defaultId = useBaseUiId();
  const controlSourceRef = useRefWithInit(() => /* @__PURE__ */ Symbol());
  const hasRegisteredRef = useRef(false);
  const hadExplicitIdRef = useRef(false);
  const unregisterControlId = useStableCallback(() => {
    if (!hasRegisteredRef.current || registerControlId === NOOP) {
      return;
    }
    hasRegisteredRef.current = false;
    registerControlId(controlSourceRef.current, void 0);
  });
  useIsoLayoutEffect(() => {
    if (!enabled || registerControlId === NOOP) {
      unregisterControlId();
      return void 0;
    }
    let nextId;
    if (id !== void 0) {
      hadExplicitIdRef.current = true;
      nextId = id;
    } else if (hadExplicitIdRef.current) {
      nextId = defaultId;
    } else {
      resetControlId();
      return void 0;
    }
    if (nextId === void 0) {
      unregisterControlId();
      return void 0;
    }
    hasRegisteredRef.current = true;
    registerControlId(controlSourceRef.current, nextId);
    return void 0;
  }, [id, enabled, registerControlId, resetControlId, defaultId, controlSourceRef, unregisterControlId]);
  useIsoLayoutEffect(() => {
    return unregisterControlId;
  }, [unregisterControlId]);
  return (enabled ? controlId : void 0) ?? id ?? defaultId;
}

// node_modules/@base-ui/react/radio-group/RadioGroupContext.mjs
init_react();
var RadioGroupContext = /* @__PURE__ */ createContext(void 0);
if (false) RadioGroupContext.displayName = "RadioGroupContext";
function useRadioGroupContext() {
  return useContext(RadioGroupContext);
}

// node_modules/@base-ui/react/radio/root/RadioRootContext.mjs
init_react();
var RadioRootContext = /* @__PURE__ */ createContext(void 0);
if (false) RadioRootContext.displayName = "RadioRootContext";
function useRadioRootContext() {
  const value = useContext(RadioRootContext);
  if (value === void 0) {
    throw new Error(false ? "Base UI: RadioRootContext is missing. Radio parts must be placed within <Radio.Root>." : formatErrorMessage_default(52));
  }
  return value;
}

// node_modules/@base-ui/react/radio/root/RadioRoot.mjs
var RadioRoot = /* @__PURE__ */ forwardRef(function RadioRoot2(componentProps, forwardedRef) {
  const {
    render,
    className,
    disabled: disabledProp = false,
    readOnly: readOnlyProp = false,
    required: requiredProp = false,
    "aria-labelledby": ariaLabelledByProp,
    value,
    inputRef: inputRefProp,
    nativeButton = false,
    id: idProp,
    style,
    ...elementProps
  } = componentProps;
  const groupContext = useRadioGroupContext();
  const {
    disabled: disabledGroup,
    readOnly: readOnlyGroup,
    required: requiredGroup,
    form: formGroup,
    checkedValue,
    touched = false,
    validation,
    name,
    setCheckedValue = NOOP,
    setTouched = NOOP,
    registerInputRef = NOOP
  } = groupContext ?? {};
  const {
    setTouched: setFieldTouched,
    setFilled,
    state: fieldState,
    disabled: fieldDisabled
  } = useFieldRootContext();
  const fieldItemContext = useFieldItemContext();
  const {
    labelId,
    getDescriptionProps
  } = useLabelableContext();
  const disabled2 = fieldDisabled || fieldItemContext.disabled || disabledGroup || disabledProp;
  const readOnly = readOnlyGroup || readOnlyProp;
  const required = requiredGroup || requiredProp;
  const form = formGroup;
  const checked4 = groupContext ? checkedValue === value : value === "";
  const radioRef = useRef(null);
  const setFieldFocused = useSetFieldFocused(disabled2, radioRef);
  const inputRef = useRef(null);
  const registerFieldInput = validation?.registerInput;
  const registerInput = useCallback((element2) => registerFieldInput?.(element2, {
    controlRef: radioRef,
    value: void 0
  }), [registerFieldInput]);
  const mergedInputRef = useMergedRefs(inputRefProp, inputRef, registerInputRef, registerInput);
  useIsoLayoutEffect(() => {
    if (inputRef.current?.checked) {
      setFilled(true);
    }
  }, [setFilled]);
  useIsoLayoutEffect(() => {
    if (!inputRef.current) {
      return;
    }
    if (disabled2 && checked4) {
      registerInputRef(null);
      return;
    }
    registerInputRef(inputRef.current);
  }, [checked4, disabled2, registerInputRef]);
  const id = useBaseUiId();
  const inputId = useLabelableId({
    id: idProp
  });
  const hiddenInputId = nativeButton ? void 0 : inputId;
  const ariaLabelledBy = useAriaLabelledBy(ariaLabelledByProp, labelId, inputRef, !nativeButton, hiddenInputId, elementProps["aria-label"]);
  const rootProps = {
    role: "radio",
    "aria-checked": checked4,
    "aria-labelledby": ariaLabelledBy,
    [ACTIVE_COMPOSITE_ITEM]: checked4 ? "" : void 0,
    id: nativeButton ? inputId : id,
    onKeyDown(event) {
      if (event.key === "Enter") {
        event.preventDefault();
      }
    },
    onClick(event) {
      if (event.defaultPrevented || disabled2 || readOnly) {
        return;
      }
      event.preventDefault();
      const input = inputRef.current;
      if (!input) {
        return;
      }
      dispatchClickWithModifiers(input, event);
    },
    onFocus(event) {
      setFieldFocused(true);
      if (event.defaultPrevented || disabled2 || readOnly || !touched) {
        return;
      }
      inputRef.current?.click();
      setTouched(false);
    },
    onBlur() {
      if (!groupContext) {
        setFieldFocused(false);
      }
    }
  };
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled: disabled2,
    native: nativeButton,
    composite: false
  });
  const inputProps = {
    type: "radio",
    ref: mergedInputRef,
    form,
    id: hiddenInputId,
    name,
    tabIndex: -1,
    style: name ? visuallyHiddenInput : visuallyHidden,
    "aria-hidden": true,
    ...value !== void 0 ? {
      value: serializeValue(value)
    } : EMPTY_OBJECT,
    disabled: disabled2,
    checked: checked4,
    required,
    readOnly,
    onChange(event) {
      if (event.nativeEvent.defaultPrevented) {
        return;
      }
      if (disabled2 || readOnly || value === void 0) {
        return;
      }
      const details = createChangeEventDetails(reason_parts_exports.none, event.nativeEvent);
      setCheckedValue(value, details);
      if (details.isCanceled) {
        return;
      }
      setFieldTouched(true);
    },
    onClick(event) {
      event.stopPropagation();
    },
    onFocus() {
      radioRef.current?.focus();
    }
  };
  const state = useMemo(() => ({
    ...fieldState,
    required,
    disabled: disabled2,
    readOnly,
    checked: checked4
  }), [fieldState, disabled2, readOnly, checked4, required]);
  const contextValue = state;
  const isRadioGroup = groupContext !== void 0;
  const refs = [forwardedRef, radioRef, buttonRef];
  const props = [rootProps, elementProps, getButtonProps, getDescriptionProps, validation ? (validationProps) => validation.getValidationProps(disabled2, validationProps) : EMPTY_OBJECT];
  const element = useRenderElement("span", componentProps, {
    enabled: !isRadioGroup,
    state,
    ref: refs,
    props,
    stateAttributesMapping
  });
  return /* @__PURE__ */ jsxs(RadioRootContext.Provider, {
    value: contextValue,
    children: [isRadioGroup ? /* @__PURE__ */ jsx(CompositeItem, {
      tag: "span",
      render,
      className,
      style,
      state,
      refs,
      props,
      stateAttributesMapping
    }) : element, /* @__PURE__ */ jsx("input", {
      ...inputProps,
      suppressHydrationWarning: true
    })]
  });
});
if (false) RadioRoot.displayName = "RadioRoot";

// node_modules/@base-ui/react/radio/indicator/RadioIndicator.mjs
init_react();
var RadioIndicator = /* @__PURE__ */ forwardRef(function RadioIndicator2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    keepMounted = false,
    ...elementProps
  } = componentProps;
  const rootState = useRadioRootContext();
  const rendered = rootState.checked;
  const {
    mounted,
    transitionStatus,
    setMounted
  } = useTransitionStatus(rendered);
  const state = {
    ...rootState,
    transitionStatus
  };
  const indicatorRef = useRef(null);
  const shouldRender = keepMounted || mounted;
  const element = useRenderElement("span", componentProps, {
    ref: [forwardedRef, indicatorRef],
    state,
    props: elementProps,
    stateAttributesMapping
  });
  useOpenChangeComplete({
    batch: true,
    enabled: !rendered,
    open: rendered,
    ref: indicatorRef,
    onComplete() {
      if (!rendered) {
        setMounted(false);
      }
    }
  });
  if (!shouldRender) {
    return null;
  }
  return element;
});
if (false) RadioIndicator.displayName = "RadioIndicator";

// node_modules/@base-ui/react/radio-group/RadioGroup.mjs
init_react();

// node_modules/@base-ui/react/internals/composite/root/CompositeRoot.mjs
init_react();

// node_modules/@base-ui/react/internals/composite/root/useCompositeRoot.mjs
init_react();
function useCompositeRoot(params) {
  const {
    loopFocus = true,
    orientation = "both",
    grid,
    onLoop,
    direction,
    highlightedIndex: externalHighlightedIndex,
    onHighlightedIndexChange: externalSetHighlightedIndex,
    rootRef: externalRef,
    enableHomeAndEndKeys = false,
    stopEventPropagation,
    disabledIndices,
    modifierKeys = EMPTY_ARRAY
  } = params;
  const [internalHighlightedIndex, internalSetHighlightedIndex] = useState(0);
  const isGrid = grid != null;
  const rootRef = useRef(null);
  const mergedRef = useMergedRefs(rootRef, externalRef);
  const elementsRef = useRef([]);
  const hasSetDefaultIndexRef = useRef(false);
  const highlightedElementRef = useRef(null);
  const highlightedIndex = externalHighlightedIndex ?? internalHighlightedIndex;
  const onHighlightedIndexChange = useStableCallback((index2, shouldScrollIntoView = false) => {
    highlightedElementRef.current = elementsRef.current[index2] ?? null;
    (externalSetHighlightedIndex ?? internalSetHighlightedIndex)(index2);
    if (shouldScrollIntoView) {
      const newActiveItem = elementsRef.current[index2];
      scrollIntoViewIfNeeded(rootRef.current, newActiveItem, direction, orientation);
    }
  });
  const onMapChange = useStableCallback((map) => {
    if (map.size === 0) {
      return;
    }
    if (hasSetDefaultIndexRef.current) {
      const elements = elementsRef.current;
      const nextIndex = elements.indexOf(highlightedElementRef.current);
      if (nextIndex === -1) {
        const replacement = elements[highlightedIndex];
        if (!replacement || isListIndexDisabled(elements, highlightedIndex, disabledIndices)) {
          onHighlightedIndexChange(getFallbackIndex(elements, disabledIndices));
        } else {
          highlightedElementRef.current = replacement;
        }
      } else if (nextIndex !== highlightedIndex) {
        onHighlightedIndexChange(nextIndex);
      }
      return;
    }
    hasSetDefaultIndexRef.current = true;
    const sortedElements = Array.from(map.keys());
    const activeItem = sortedElements.find((compositeElement) => compositeElement?.hasAttribute(ACTIVE_COMPOSITE_ITEM)) ?? null;
    const activeIndex = activeItem ? map.get(activeItem)?.index ?? -1 : -1;
    if (activeIndex !== -1) {
      onHighlightedIndexChange(activeIndex);
    } else if (isListIndexDisabled(sortedElements, highlightedIndex, disabledIndices)) {
      const firstEnabledIndex = findNonDisabledListIndex(sortedElements, {
        disabledIndices
      });
      if (!isIndexOutOfListBounds(sortedElements, firstEnabledIndex)) {
        onHighlightedIndexChange(firstEnabledIndex);
      }
    }
    scrollIntoViewIfNeeded(rootRef.current, activeItem, direction, orientation);
  });
  useIsoLayoutEffect(() => {
    if (disabledIndices == null || externalHighlightedIndex != null || !hasSetDefaultIndexRef.current) {
      return;
    }
    const elements = elementsRef.current;
    if (isListIndexDisabled(elements, highlightedIndex, disabledIndices)) {
      const firstEnabledIndex = findNonDisabledListIndex(elements, {
        disabledIndices
      });
      if (!isIndexOutOfListBounds(elements, firstEnabledIndex)) {
        onHighlightedIndexChange(firstEnabledIndex);
      }
    }
  }, [disabledIndices, externalHighlightedIndex, highlightedIndex, elementsRef, onHighlightedIndexChange]);
  const wrappedOnLoop = useStableCallback((event, prevIndex, nextIndex) => {
    if (!onLoop) {
      return nextIndex;
    }
    return onLoop(event, prevIndex, nextIndex, elementsRef);
  });
  const onKeyDown = useStableCallback((event) => {
    const isHomeOrEnd = event.key === HOME || event.key === END;
    if (!COMPOSITE_KEYS.has(event.key) || !enableHomeAndEndKeys && isHomeOrEnd) {
      return;
    }
    if (isModifierKeySet(event, modifierKeys)) {
      return;
    }
    const element = rootRef.current;
    if (!element) {
      return;
    }
    const isRtl = direction === "rtl";
    const horizontalForwardKey = isRtl ? ARROW_LEFT2 : ARROW_RIGHT2;
    const horizontalBackwardKey = isRtl ? ARROW_RIGHT2 : ARROW_LEFT2;
    const forwardKey = orientation === "vertical" ? ARROW_DOWN2 : horizontalForwardKey;
    const backwardKey = orientation === "vertical" ? ARROW_UP2 : horizontalBackwardKey;
    const target = getTarget(event.nativeEvent);
    if (target != null && isNativeInput(target) && !isElementDisabled(target)) {
      const selectionStart = target.selectionStart;
      const selectionEnd = target.selectionEnd;
      const textContent = target.value;
      if (selectionStart == null || event.shiftKey || selectionStart !== selectionEnd) {
        return;
      }
      if (event.key !== backwardKey && selectionStart < textContent.length) {
        return;
      }
      if (event.key !== forwardKey && selectionStart > 0) {
        return;
      }
    }
    let nextIndex = highlightedIndex;
    const minIndex = getMinListIndex(elementsRef, disabledIndices);
    const maxIndex = getMaxListIndex(elementsRef, disabledIndices);
    if (grid != null) {
      nextIndex = grid({
        disabledIndices,
        elementsRef,
        event,
        highlightedIndex,
        loopFocus,
        maxIndex,
        minIndex,
        onLoop: wrappedOnLoop,
        orientation,
        rtl: isRtl
      });
    }
    const isForwardKey = orientation !== "vertical" && event.key === horizontalForwardKey || orientation !== "horizontal" && event.key === ARROW_DOWN2;
    const isBackwardKey = orientation !== "vertical" && event.key === horizontalBackwardKey || orientation !== "horizontal" && event.key === ARROW_UP2;
    if (enableHomeAndEndKeys) {
      if (event.key === HOME) {
        nextIndex = minIndex;
      } else if (event.key === END) {
        nextIndex = maxIndex;
      }
    }
    if (nextIndex === highlightedIndex && (isForwardKey || isBackwardKey)) {
      if (loopFocus && nextIndex === maxIndex && isForwardKey) {
        nextIndex = minIndex;
        if (onLoop) {
          nextIndex = onLoop(event, highlightedIndex, nextIndex, elementsRef);
        }
      } else if (loopFocus && nextIndex === minIndex && isBackwardKey) {
        nextIndex = maxIndex;
        if (onLoop) {
          nextIndex = onLoop(event, highlightedIndex, nextIndex, elementsRef);
        }
      } else {
        nextIndex = findNonDisabledListIndex(elementsRef.current, {
          startingIndex: nextIndex,
          decrement: isBackwardKey,
          disabledIndices
        });
      }
    }
    if (nextIndex !== highlightedIndex && !isIndexOutOfListBounds(elementsRef.current, nextIndex)) {
      if (stopEventPropagation) {
        event.stopPropagation();
      }
      if (isGrid || isHomeOrEnd || isForwardKey || isBackwardKey) {
        event.preventDefault();
      }
      onHighlightedIndexChange(nextIndex, true);
      queueMicrotask(() => {
        elementsRef.current[nextIndex]?.focus();
      });
    }
  });
  const props = {
    ref: mergedRef,
    onFocus(event) {
      const element = rootRef.current;
      const target = getTarget(event.nativeEvent);
      if (!element || target == null || !isNativeInput(target)) {
        return;
      }
      target.setSelectionRange(0, target.value.length);
    },
    onKeyDown
  };
  return {
    props,
    highlightedIndex,
    onHighlightedIndexChange,
    elementsRef,
    onMapChange,
    relayKeyboardEvent: onKeyDown
  };
}
function getFallbackIndex(elements, disabledIndices) {
  let fallbackIndex = -1;
  for (let index2 = 0; index2 < elements.length; index2 += 1) {
    const element = elements[index2];
    if (!element || isListIndexDisabled(elements, index2, disabledIndices)) {
      continue;
    }
    if (element.hasAttribute(ACTIVE_COMPOSITE_ITEM)) {
      return index2;
    }
    if (fallbackIndex === -1) {
      fallbackIndex = index2;
    }
  }
  return Math.max(fallbackIndex, 0);
}
function isModifierKeySet(event, ignoredModifierKeys) {
  for (const key of MODIFIER_KEYS) {
    if (ignoredModifierKeys.includes(key)) {
      continue;
    }
    if (event.getModifierState(key)) {
      return true;
    }
  }
  return false;
}

// node_modules/@base-ui/react/internals/composite/root/CompositeRoot.mjs
function CompositeRoot(componentProps) {
  const {
    render,
    className,
    style,
    refs = EMPTY_ARRAY,
    props = EMPTY_ARRAY,
    state = EMPTY_OBJECT,
    stateAttributesMapping: stateAttributesMapping2,
    highlightedIndex: highlightedIndexProp,
    onHighlightedIndexChange: onHighlightedIndexChangeProp,
    orientation,
    grid,
    loopFocus,
    onLoop,
    enableHomeAndEndKeys,
    onMapChange: onMapChangeProp,
    stopEventPropagation = true,
    rootRef,
    disabledIndices,
    modifierKeys,
    highlightItemOnHover = false,
    tag = "div",
    ...elementProps
  } = componentProps;
  const direction = useDirection();
  const {
    props: defaultProps,
    highlightedIndex,
    onHighlightedIndexChange,
    elementsRef,
    onMapChange: onMapChangeUnwrapped,
    relayKeyboardEvent
  } = useCompositeRoot({
    grid,
    loopFocus,
    onLoop,
    orientation,
    highlightedIndex: highlightedIndexProp,
    onHighlightedIndexChange: onHighlightedIndexChangeProp,
    rootRef,
    stopEventPropagation,
    enableHomeAndEndKeys,
    direction,
    disabledIndices,
    modifierKeys
  });
  const element = useRenderElement(tag, componentProps, {
    state,
    ref: refs,
    props: [defaultProps, ...props, elementProps],
    stateAttributesMapping: stateAttributesMapping2
  });
  const contextValue = useMemo(() => ({
    highlightedIndex,
    onHighlightedIndexChange,
    highlightItemOnHover,
    relayKeyboardEvent
  }), [highlightedIndex, onHighlightedIndexChange, highlightItemOnHover, relayKeyboardEvent]);
  return /* @__PURE__ */ jsx(CompositeRootContext.Provider, {
    value: contextValue,
    children: /* @__PURE__ */ jsx(CompositeList, {
      elementsRef,
      onMapChange: (newMap) => {
        onMapChangeProp?.(newMap);
        onMapChangeUnwrapped(newMap);
      },
      children: element
    })
  });
}

// node_modules/@base-ui/react/internals/field-register-control/useRegisterFieldControl.mjs
function useRegisterFieldControl(controlRef, id, value, getFormValueOverride, enabled = true, name) {
  const {
    registerFieldControl
  } = useFieldRootContext();
  const sourceRef = useRefWithInit(() => /* @__PURE__ */ Symbol());
  useIsoLayoutEffect(() => {
    const source = sourceRef.current;
    if (!enabled) {
      registerFieldControl(source, void 0);
      return;
    }
    const registration = {
      controlRef,
      getValue: getFormValueOverride,
      id,
      name,
      value
    };
    registerFieldControl(source, registration);
  }, [controlRef, enabled, getFormValueOverride, id, name, registerFieldControl, sourceRef, value]);
  useIsoLayoutEffect(() => {
    const source = sourceRef.current;
    return () => {
      registerFieldControl(source, void 0);
    };
  }, [registerFieldControl, sourceRef]);
}

// node_modules/@base-ui/react/field/root/useFieldValidation.mjs
init_react();

// node_modules/@base-ui/react/internals/form-context/FormContext.mjs
init_react();
var FormContext = /* @__PURE__ */ createContext({
  elementRef: {
    current: null
  },
  formRef: {
    current: {
      fields: /* @__PURE__ */ new Map()
    }
  },
  errors: {},
  clearErrors: NOOP,
  validationMode: "onSubmit",
  submitCountRef: {
    current: 0
  }
});
if (false) FormContext.displayName = "FormContext";
function useFormContext() {
  return useContext(FormContext);
}

// node_modules/@base-ui/react/field/root/useFieldValidation.mjs
var validityKeys = Object.keys(DEFAULT_VALIDITY_STATE);
function isEligibleInput(input, formElement) {
  if (input.matches(":disabled")) {
    return false;
  }
  if (!formElement || input.form === formElement) {
    return true;
  }
  return input.form === null && !input.hasAttribute("form");
}

// node_modules/@base-ui/react/fieldset/root/FieldsetRootContext.mjs
init_react();
var FieldsetRootContext = /* @__PURE__ */ createContext(void 0);
if (false) FieldsetRootContext.displayName = "FieldsetRootContext";
function useFieldsetRootContext(optional = false) {
  const context = useContext(FieldsetRootContext);
  if (!context && !optional) {
    throw new Error(false ? "Base UI: FieldsetRootContext is missing. Fieldset parts must be placed within <Fieldset.Root>." : formatErrorMessage_default(86));
  }
  return context;
}

// node_modules/@base-ui/react/radio-group/RadioGroup.mjs
var MODIFIER_KEYS2 = [SHIFT];
var RadioGroup = /* @__PURE__ */ forwardRef(function RadioGroup2(componentProps, forwardedRef) {
  const {
    render,
    className,
    disabled: disabledProp,
    readOnly,
    required,
    onValueChange: onValueChangeProp,
    value: externalValue,
    defaultValue,
    form,
    name: nameProp,
    inputRef: inputRefProp,
    id: idProp,
    style,
    ...elementProps
  } = componentProps;
  const {
    setTouched: setFieldTouched,
    setFocused,
    validationMode,
    name: fieldName,
    disabled: fieldDisabled,
    state: fieldState,
    validation,
    setDirty,
    setFilled,
    validityData
  } = useFieldRootContext();
  const {
    labelId
  } = useLabelableContext();
  const {
    clearErrors,
    elementRef
  } = useFormContext();
  const fieldsetContext = useFieldsetRootContext(true);
  const disabled2 = fieldDisabled || disabledProp;
  const name = fieldName ?? nameProp;
  const id = useBaseUiId(idProp);
  const [checkedValue, setCheckedValueUnwrapped] = useControlled({
    controlled: externalValue,
    default: defaultValue,
    name: "RadioGroup",
    state: "value"
  });
  const [touched, setTouched] = useState(false);
  const setCheckedValue = useStableCallback((value, eventDetails) => {
    onValueChangeProp?.(value, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    setCheckedValueUnwrapped(value);
  });
  const getInputControl = validation.getInputControl;
  const controlRef = useMemo(() => ({
    get current() {
      return getInputControl();
    }
  }), [getInputControl]);
  const groupInputRef = useRef(null);
  const firstEnabledInputRef = useRef(null);
  const mergedInputRef = useMergedRefs(groupInputRef, inputRefProp);
  const lastAppliedInputRef = useRef(mergedInputRef);
  const setInputRef = useStableCallback((hiddenInput) => {
    if (groupInputRef.current === hiddenInput && lastAppliedInputRef.current === mergedInputRef) {
      return;
    }
    lastAppliedInputRef.current = mergedInputRef;
    void mergedInputRef?.(hiddenInput);
  });
  useIsoLayoutEffect(() => {
    setInputRef(groupInputRef.current);
  }, [mergedInputRef, setInputRef]);
  const registerInputRef = useStableCallback((input) => {
    if (!input) {
      return void 0;
    }
    if (!input.disabled) {
      if (!firstEnabledInputRef.current) {
        firstEnabledInputRef.current = input;
      }
      const currentInput = groupInputRef.current;
      if (input.checked || currentInput == null || currentInput.disabled) {
        setInputRef(input);
      }
    }
    return () => {
      if (firstEnabledInputRef.current === input) {
        firstEnabledInputRef.current = null;
      }
      if (groupInputRef.current === input) {
        setInputRef(null);
      }
    };
  });
  const getFormValue = useStableCallback(() => {
    const formElement = elementRef.current;
    if (!formElement) {
      return checkedValue ?? null;
    }
    for (const input of validation.registeredInputs.keys()) {
      if (input.checked && isEligibleInput(input, formElement)) {
        return checkedValue ?? null;
      }
    }
    return null;
  });
  useRegisterFieldControl(controlRef, id, checkedValue ?? null, getFormValue, !disabled2, nameProp);
  useValueChanged(checkedValue, () => {
    clearErrors(name);
    setDirty(checkedValue !== validityData.initialValue);
    setFilled(checkedValue != null);
    validation.change(checkedValue);
    const fallbackInput = firstEnabledInputRef.current;
    if (checkedValue == null && fallbackInput && !fallbackInput.disabled) {
      setInputRef(fallbackInput);
    }
  });
  const ariaLabelledby = labelId ?? fieldsetContext?.legendId;
  const state = {
    ...fieldState,
    disabled: disabled2 ?? false,
    required: required ?? false,
    readOnly: readOnly ?? false
  };
  const contextValue = useMemo(() => ({
    checkedValue,
    disabled: disabled2,
    form,
    validation,
    name,
    readOnly,
    registerInputRef,
    required,
    setCheckedValue,
    setTouched,
    touched
  }), [checkedValue, disabled2, form, validation, name, readOnly, registerInputRef, required, setCheckedValue, setTouched, touched]);
  const defaultProps = {
    id: idProp,
    role: "radiogroup",
    "aria-required": required || void 0,
    "aria-disabled": disabled2 || void 0,
    "aria-readonly": readOnly || void 0,
    "aria-labelledby": ariaLabelledby,
    onBlur(event) {
      if (!contains(event.currentTarget, event.relatedTarget)) {
        setTouched(false);
        setFieldTouched(true);
        setFocused(false);
        if (validationMode === "onBlur") {
          validation.commit(checkedValue);
        }
      }
    },
    onKeyDownCapture(event) {
      if (event.key.startsWith("Arrow")) {
        setTouched(true);
      }
    }
  };
  return /* @__PURE__ */ jsx(RadioGroupContext.Provider, {
    value: contextValue,
    children: /* @__PURE__ */ jsx(CompositeRoot, {
      render,
      className,
      style,
      state,
      props: [defaultProps, elementProps, (props) => validation.getValidationProps(disabled2 ?? false, props)],
      refs: [forwardedRef],
      stateAttributesMapping: fieldValidityMapping,
      enableHomeAndEndKeys: false,
      modifierKeys: MODIFIER_KEYS2
    })
  });
});
if (false) RadioGroup.displayName = "RadioGroup";

// node_modules/@base-ui/react/checkbox/index.parts.mjs
var index_parts_exports4 = {};
__export(index_parts_exports4, {
  Indicator: () => CheckboxIndicator,
  Root: () => CheckboxRoot
});

// node_modules/@base-ui/react/checkbox/root/CheckboxRoot.mjs
init_react();

// node_modules/@base-ui/utils/getDefaultFormSubmitter.mjs
function getDefaultFormSubmitter(form) {
  if (!form) {
    return null;
  }
  for (const candidate of form.elements) {
    const tagName = candidate.tagName;
    if (tagName === "BUTTON" || tagName === "INPUT") {
      const button = candidate;
      if (button.type === "submit") {
        return button;
      }
    }
  }
  return null;
}

// node_modules/@base-ui/react/checkbox/root/CheckboxRootDataAttributes.mjs
var checked3 = "data-checked";
var unchecked3 = "data-unchecked";

// node_modules/@base-ui/react/checkbox/utils/getCheckboxStateAttributesMapping.mjs
function getCheckboxStateAttributesMapping(state) {
  return {
    checked(value) {
      if (state.indeterminate) {
        return {};
      }
      if (value) {
        return {
          [checked3]: ""
        };
      }
      return {
        [unchecked3]: ""
      };
    },
    ...fieldValidityMapping
  };
}

// node_modules/@base-ui/react/checkbox-group/CheckboxGroupContext.mjs
init_react();
var CheckboxGroupContext = /* @__PURE__ */ createContext(void 0);
if (false) CheckboxGroupContext.displayName = "CheckboxGroupContext";
function useCheckboxGroupContext() {
  return useContext(CheckboxGroupContext);
}

// node_modules/@base-ui/react/checkbox/root/CheckboxRootContext.mjs
init_react();
var CheckboxRootContext = /* @__PURE__ */ createContext(void 0);
if (false) CheckboxRootContext.displayName = "CheckboxRootContext";
function useCheckboxRootContext() {
  const context = useContext(CheckboxRootContext);
  if (context === void 0) {
    throw new Error(false ? "Base UI: CheckboxRootContext is missing. Checkbox parts must be placed within <Checkbox.Root>." : formatErrorMessage_default(14));
  }
  return context;
}

// node_modules/@base-ui/react/checkbox/root/CheckboxRoot.mjs
var PARENT_CHECKBOX = "data-parent";
var CheckboxRoot = /* @__PURE__ */ forwardRef(function CheckboxRoot2(componentProps, forwardedRef) {
  const {
    checked: checkedProp,
    className,
    defaultChecked = false,
    "aria-labelledby": ariaLabelledByProp,
    disabled: disabledProp = false,
    form,
    id: idProp,
    indeterminate = false,
    inputRef: inputRefProp,
    name: nameProp,
    onCheckedChange,
    parent = false,
    readOnly = false,
    render,
    required = false,
    uncheckedValue,
    value: valueProp,
    nativeButton = false,
    style,
    ...elementProps
  } = componentProps;
  const {
    clearErrors
  } = useFormContext();
  const {
    disabled: rootDisabled,
    name: fieldName,
    setDirty,
    setFilled,
    setTouched,
    state: fieldState,
    validationMode,
    validityData,
    validation: localValidation
  } = useFieldRootContext();
  const fieldItemContext = useFieldItemContext();
  const {
    labelId,
    registerControlId,
    getDescriptionProps
  } = useLabelableContext();
  const groupContext = useCheckboxGroupContext();
  const parentContext = groupContext?.allValues === void 0 ? void 0 : groupContext.parent;
  const isGroupedWithParent = parentContext !== void 0;
  const disabled2 = rootDisabled || fieldItemContext.disabled || groupContext?.disabled || disabledProp;
  const name = fieldName ?? nameProp;
  const value = valueProp ?? name;
  const id = useBaseUiId();
  const ownsControlId = groupContext?.registerControlId !== registerControlId;
  const controlId = useLabelableId({
    id: idProp || void 0,
    enabled: ownsControlId
  });
  const rootId = nativeButton ? controlId : id;
  let groupProps = {};
  if (isGroupedWithParent) {
    if (parent) {
      groupProps = parentContext.getParentProps();
    } else if (value !== void 0) {
      groupProps = parentContext.getChildProps(value);
    }
  }
  const {
    checked: groupChecked = checkedProp,
    indeterminate: groupIndeterminate = indeterminate,
    onCheckedChange: groupOnChange,
    ...otherGroupProps
  } = groupProps;
  const groupValue = groupContext?.value;
  const controlRef = useRef(null);
  const setFocused = useSetFieldFocused(disabled2, controlRef);
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled: disabled2,
    native: nativeButton
  });
  const validation = groupContext?.validation ?? localValidation;
  const [checked4, setCheckedState] = useControlled({
    controlled: value !== void 0 && groupValue !== void 0 && !parent ? groupValue.includes(value) : groupChecked,
    default: defaultChecked,
    name: "Checkbox",
    state: "checked"
  });
  const computedChecked = isGroupedWithParent ? Boolean(groupChecked) : checked4;
  const computedIndeterminate = isGroupedWithParent ? groupIndeterminate || indeterminate : indeterminate;
  useRegisterFieldControl(controlRef, id, checked4, void 0, !groupContext && !disabled2, nameProp);
  const registerChildId = parentContext?.registerChildId;
  const inputRef = useRef(null);
  const registerFieldInput = validation.registerInput;
  const registeredInputValue = groupContext ? value : void 0;
  const registerInput = useCallback((element2) => registerFieldInput(element2, {
    controlRef,
    value: registeredInputValue
  }), [registerFieldInput, registeredInputValue]);
  const mergedInputRef = useMergedRefs(inputRefProp, inputRef, parent ? void 0 : registerInput);
  const ariaLabelledBy = useAriaLabelledBy(ariaLabelledByProp, labelId, inputRef, !nativeButton, controlId, elementProps["aria-label"]);
  useIsoLayoutEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = computedIndeterminate;
    }
    if (!groupContext) {
      setFilled(checked4);
    }
  }, [checked4, computedIndeterminate, groupContext, setFilled]);
  useValueChanged(checked4, () => {
    if (groupContext) {
      return;
    }
    clearErrors(name);
    setDirty(checked4 !== validityData.initialValue);
    validation.change(checked4);
  });
  const inputProps = mergeProps(
    {
      checked: checked4,
      disabled: disabled2,
      form,
      // parent checkboxes unset `name` to be excluded from form submission
      name: parent ? void 0 : name,
      // Set `id` to stop Chrome warning about an unassociated input.
      // When using a native button, the `id` is applied to the button instead.
      id: nativeButton ? void 0 : controlId,
      required,
      ref: mergedInputRef,
      style: name ? visuallyHiddenInput : visuallyHidden,
      tabIndex: -1,
      type: "checkbox",
      "aria-hidden": true,
      onChange(event) {
        if (event.nativeEvent.defaultPrevented) {
          return;
        }
        if (readOnly) {
          event.preventDefault();
          return;
        }
        const nextChecked = event.currentTarget.checked;
        const details = createChangeEventDetails(reason_parts_exports.none, event.nativeEvent);
        onCheckedChange?.(nextChecked, details);
        if (details.isCanceled) {
          return;
        }
        groupOnChange?.(nextChecked, details);
        if (details.isCanceled) {
          return;
        }
        setCheckedState(nextChecked);
        if (value !== void 0 && groupContext !== void 0 && !parent && !isGroupedWithParent) {
          const nextGroupValue = nextChecked ? [...groupContext.value, value] : groupContext.value.filter((item) => item !== value);
          groupContext.setValue(nextGroupValue, details);
        }
      },
      onClick(event) {
        event.stopPropagation();
      },
      onFocus() {
        controlRef.current?.focus();
      }
    },
    // React <19 sets an empty value if `undefined` is passed explicitly
    // To avoid this, we only set the value if it's defined
    valueProp !== void 0 ? {
      value: (groupContext ? checked4 && valueProp : valueProp) || ""
    } : EMPTY_OBJECT,
    getDescriptionProps,
    (props) => validation.getValidationProps(disabled2, props)
  );
  useEffect(() => {
    if (!parentContext || value === void 0) {
      return void 0;
    }
    const disabledStates = parentContext.disabledStatesRef.current;
    disabledStates.set(value, disabled2);
    return () => {
      disabledStates.delete(value);
    };
  }, [parentContext, disabled2, value]);
  const state = useMemo(() => ({
    ...fieldState,
    checked: computedChecked,
    disabled: disabled2,
    readOnly,
    required,
    indeterminate: computedIndeterminate
  }), [fieldState, computedChecked, disabled2, readOnly, required, computedIndeterminate]);
  const stateAttributesMapping2 = getCheckboxStateAttributesMapping(state);
  const element = useRenderElement("span", componentProps, {
    state,
    ref: [buttonRef, controlRef, forwardedRef],
    props: [{
      id: rootId,
      role: "checkbox",
      "aria-checked": computedIndeterminate ? "mixed" : computedChecked,
      "aria-readonly": readOnly || void 0,
      "aria-required": required || void 0,
      "aria-labelledby": ariaLabelledBy,
      [PARENT_CHECKBOX]: parent ? "" : void 0,
      onFocus() {
        setFocused(true);
      },
      onBlur() {
        const inputEl = inputRef.current;
        if (!inputEl) {
          return;
        }
        setTouched(true);
        setFocused(false);
        if (validationMode === "onBlur") {
          validation.commit(groupContext ? groupValue : inputEl.checked);
        }
      },
      onKeyDown(event) {
        if (event.key !== "Enter") {
          return;
        }
        event.preventBaseUIHandler();
        if (event.defaultPrevented) {
          return;
        }
        const formToSubmit = inputRef.current?.form ?? null;
        const currentTarget = event.currentTarget;
        const nativeEvent = event.nativeEvent;
        const originalPreventDefault = event.preventDefault;
        const originalNativePreventDefault = nativeEvent.preventDefault;
        let preventDefaultCalledAfterPropagation = false;
        event.preventDefault = () => {
          preventDefaultCalledAfterPropagation = true;
          originalPreventDefault.call(event);
        };
        nativeEvent.preventDefault = () => {
          preventDefaultCalledAfterPropagation = true;
          originalNativePreventDefault.call(nativeEvent);
        };
        originalNativePreventDefault.call(nativeEvent);
        getWindow(currentTarget).queueMicrotask(() => {
          event.preventDefault = originalPreventDefault;
          nativeEvent.preventDefault = originalNativePreventDefault;
          if (!preventDefaultCalledAfterPropagation) {
            getDefaultFormSubmitter(formToSubmit)?.click();
          }
        });
      },
      onClick(event) {
        if (readOnly || disabled2) {
          return;
        }
        event.preventDefault();
        const input = inputRef.current;
        if (!input) {
          return;
        }
        dispatchClickWithModifiers(input, event);
      }
    }, elementProps, otherGroupProps, getButtonProps, getDescriptionProps, (props) => validation.getValidationProps(disabled2, props)],
    stateAttributesMapping: stateAttributesMapping2
  });
  const renderedId = element.props.id;
  useIsoLayoutEffect(() => {
    if (!registerChildId || parent || value === void 0 || renderedId === void 0) {
      return void 0;
    }
    return registerChildId(value, renderedId);
  }, [registerChildId, parent, value, renderedId]);
  return /* @__PURE__ */ jsxs(CheckboxRootContext.Provider, {
    value: state,
    children: [element, !checked4 && !groupContext && name && !parent && uncheckedValue !== void 0 && /* @__PURE__ */ jsx("input", {
      type: "hidden",
      form,
      name,
      value: uncheckedValue,
      disabled: disabled2
    }), /* @__PURE__ */ jsx("input", {
      ...inputProps,
      suppressHydrationWarning: true
    })]
  });
});
if (false) CheckboxRoot.displayName = "CheckboxRoot";

// node_modules/@base-ui/react/checkbox/indicator/CheckboxIndicator.mjs
init_react();
var CheckboxIndicator = /* @__PURE__ */ forwardRef(function CheckboxIndicator2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    keepMounted = false,
    ...elementProps
  } = componentProps;
  const rootState = useCheckboxRootContext();
  const rendered = rootState.checked || rootState.indeterminate;
  const {
    mounted,
    transitionStatus,
    setMounted
  } = useTransitionStatus(rendered);
  const indicatorRef = useRef(null);
  const state = {
    ...rootState,
    transitionStatus
  };
  useOpenChangeComplete({
    batch: true,
    enabled: !rendered,
    open: rendered,
    ref: indicatorRef,
    onComplete() {
      if (!rendered) {
        setMounted(false);
      }
    }
  });
  const baseStateAttributesMapping = getCheckboxStateAttributesMapping(rootState);
  const stateAttributesMapping2 = {
    ...baseStateAttributesMapping,
    ...transitionStatusMapping
  };
  const shouldRender = keepMounted || mounted;
  const element = useRenderElement("span", componentProps, {
    ref: [forwardedRef, indicatorRef],
    state,
    stateAttributesMapping: stateAttributesMapping2,
    props: elementProps
  });
  if (!shouldRender) {
    return null;
  }
  return element;
});
if (false) CheckboxIndicator.displayName = "CheckboxIndicator";
export {
  index_parts_exports4 as Checkbox,
  index_parts_exports as Menu,
  index_parts_exports2 as Popover,
  index_parts_exports3 as Radio,
  RadioGroup
};
