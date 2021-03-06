/*
@license
Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

import ArcsUtils from "../lib/arcs-utils.js";
import XenBase from "../../components/xen/xen-base.js";

const template = Object.assign(document.createElement('template'), {innerHTML:
  `<style>
    :host {
      display: block;
      box-sizing: border-box;
    }
  </style>
  <slot></slot>`
});

class ArcHost extends XenBase {
  static get observedAttributes() {
    return ['config','plans','plan','manifests','exclusions'];
  }
  get template() { return template; }
  _getInitialState() {
    return {
      invalid: 0
    };
  }
  _willReceiveProps(props, state, lastProps) {
    if (props.manifests && props.exclusions) {
      state.effectiveManifests = this._intersectManifests(props.manifests, props.exclusions);
    }
    if (props.config && props.config !== state.config && state.effectiveManifests) {
      state.config = props.config;
      state.config.manifests = state.effectiveManifests;
      this._applyConfig(state.config)
    }
    else if (state.arc && (props.manifests !== lastProps.manifests || props.exclusions != lastProps.exclusions)) {
      ArcHost.log('reloading')
      this._reloadManifests();
    }
    if (props.plan && lastProps.plan !== props.plan) {
      this._applySuggestion(state.arc, props.plan);
    }
    if (props.plans && lastProps.plans !== props.plans) {
      state.slotComposer.setSuggestions(props.plans);
    }
  }
  _intersectManifests(manifests, exclusions) {
    return manifests.filter(m => !exclusions.includes(m));
  }
  async _update(props, state) {
    if (state.arc && !props.plans) {
      this._schedulePlanning(state);
    }
  }
  async _applyConfig(config) {
    let arc = await this._createArc(config);
    arc.makeSuggestions = async () => { this._schedulePlanning(state); }
    ArcHost.log('instantiated', arc);
    this._setState({arc});
    this._fire('arc', arc)
  }
  async _createArc(config) {
    // make an id
    let id = 'demo-' + ArcsUtils.randomId();
    // create a system loader
    let loader = this._marshalLoader(config);
    // load manifest
    let context = await this._loadManifest(config, loader);
    // composer
    let slotComposer = new Arcs.SlotComposer({
      rootContext: this.parentElement,
      affordance: config.affordance,
      containerKind: config.containerKind,
      // TODO(sjmiles): typically resolved via `slotid="suggestions"`, but override is allowed here via config
      suggestionsContext: config.suggestionsNode
    });
    // capture composer so we can push suggestions there
    this._state.slotComposer = slotComposer;
    // send urlMap to the Arc so worker-entry*.js can create mapping loaders
    let urlMap = loader._urlMap;
    // Arc!
    return ArcsUtils.createArc({id, urlMap, slotComposer, context, loader});
  }
  _marshalLoader(config) {
    // create default URL map
    let urlMap = ArcsUtils.createUrlMap(config.root);
    // create a system loader
    // TODO(sjmiles): `pecFactory` creates loader objects (via worker-entry*.js) for the innerPEC,
    // but we have to create one by hand for manifest loading
    let loader = new Arcs.BrowserLoader(urlMap);
    // add `urls` to `urlMap` after a resolve pass
    if (config.urls) {
      Object.keys(config.urls).forEach(k => urlMap[k] = loader._resolve(config.urls[k]));
    }
    return loader;
  }
  async _loadManifest(config, loader) {
    let manifest, {folder, content} = this._fetchManifestContent(config);
    try {
      manifest = await ArcsUtils.parseManifest(`${folder}/`, content, loader);
    } catch(x) {
      console.warn(x);
      manifest = ArcsUtils.parseManifest(`${folder}/`, '', loader);
    }
    return manifest;
  }
  _fetchManifestContent(config) {
    let manifests;
    if (config.soloPath) {
      manifests = [config.soloPath];
    } else {
      manifests = config.manifests ? config.manifests.slice() : [];
      if (config.manifestPath) {
        manifests.push(config.manifestPath);
      }
    }
    let folder = '.';
    //let path = './arcs.manifest';
    //let folder = path.split('/').slice(0, -1).join('/') || '.';
    let content = manifests.map(u => `import '${u}'`).join('\n');
    return {folder, content};
  }
  _schedulePlanning(state) {
    // results obtained before now are invalid
    state.invalid = true;
    // only wait for one _beginPlanning at a time
    if (!state.planning) {
      state.planning = true;
      // old plans are stale, evacipate them
      ArcHost.log('clearing old plans');
      this._fire('plans', null);
      // TODO(sjmiles): primitive attempt to throttle planning
      setTimeout(async () => {
        await this._beginPlanning(state)
        state.planning = false;
      }, 300);
    }
  }
  async _beginPlanning(state) {
    let plans;
    while (state.invalid) {
      state.invalid = false;
      plans = await this._plan(state.arc);
    }
    ArcHost.log(`plans`, plans);
    this._fire('plans', plans);
  }
  async _plan(arc) {
    return await ArcsUtils.makePlans(arc, 5000) || [];
  }
  async _applySuggestion(arc, plan) {
    // TODO(sjmiles): instantiation takes some non-deterministic amount of time to complete,
    // we need some additional signals in combination with a more robust system for invalidating
    // suggestions. Currently, most of the asynchrony is _short-term_, such that a simple
    // timeout here is likely to catch the vast majority of the work. This is just a temporary solution,
    // since it's a just another race-condition in actuality (I've merely slowed one of the racers).
    // The timeout value is a magic number.
    arc.instantiate(plan);
    return new Promise((resolve, reject) => {
      setTimeout(resolve, 200);
    }).then(() => {
      this._fire('applied', plan);
    });
  }
  async _reloadManifests() {
    let {arc} = this._state;
    arc._context = await this._loadManifest(this._props.config, arc.loader);
    this._fire('plans', null);
  }
}
ArcHost.log = XenBase.logFactory('ArcHost', '#007ac1');
ArcHost.groupCollapsed = XenBase.logFactory('ArcHost', '#007ac1', 'groupCollapsed');
customElements.define('arc-host', ArcHost);
