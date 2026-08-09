(function (root) {
  /* 唯一结构算法必须保持 ES5；手机端直接导入，Vite 同时原样输出给 Kindle。 */
  var STANDARD_SHELL = { width: 238, height: 315, columns: [144, 8, 70] };
  var WIDE_SHELL = { width: 358, height: 280, columns: [74, 8, 194, 8, 74] };
  var HINGE_POSITIONS = [25, 75];

  function numberOr(value, fallback) {
    return typeof value === 'number' ? value : fallback;
  }

  function geometryOf(zone) {
    var geometry = zone.geometry || {};
    return {
      x: numberOr(geometry.x, 0),
      y: numberOr(geometry.y, 0),
      width: numberOr(geometry.width, 100),
      height: numberOr(geometry.height, 100),
      layoutKind: geometry.layout_kind === 'single_row' ? 'single_row' : 'vertical'
    };
  }

  function getShellGeometry(templateKey) {
    if (templateKey === 'side_by_side') return WIDE_SHELL;
    if (templateKey === 'french_door') {
      return { width: 358, height: 285, columns: WIDE_SHELL.columns };
    }
    if (templateKey === 'mini') {
      return { width: 180, height: 245, columns: [120, 8, 52] };
    }
    return STANDARD_SHELL;
  }

  function getDoorColdRegion(cabinetZones) {
    var largest = null;
    var index;
    var zone;
    for (index = 0; index < cabinetZones.length; index += 1) {
      zone = cabinetZones[index];
      if (zone.temperature_mode !== 'cold') continue;
      if (!largest || geometryOf(zone).height > geometryOf(largest).height) largest = zone;
    }
    return largest
      ? { y: geometryOf(largest).y, height: geometryOf(largest).height }
      : { y: 0, height: 100 };
  }

  function doorSegmentGeometry(templateKey, cabinetZones, doorZones, doorZone) {
    if (templateKey === 'mini') {
      return doorZone.key === 'door' ? { y: 50, height: 50 } : { y: 0, height: 50 };
    }
    if (doorZones.length === 1 && doorZones[0].key === 'door') {
      return getDoorColdRegion(cabinetZones);
    }
    return { y: geometryOf(doorZone).y, height: geometryOf(doorZone).height };
  }

  function doorSegment(zone, slots, geometry) {
    return {
      zone: zone,
      slots: slots,
      top: geometry.y,
      height: geometry.height
    };
  }

  function getDoorPanels(templateKey, cabinetZones, doorZones) {
    var panels = { left: [], right: [] };
    var wide = templateKey === 'side_by_side' || templateKey === 'french_door';
    var index;
    var zone;
    var geometry;
    var slots;
    var splitIndex;

    for (index = 0; index < doorZones.length; index += 1) {
      zone = doorZones[index];
      geometry = doorSegmentGeometry(templateKey, cabinetZones, doorZones, zone);
      slots = zone.slots || [];
      if (!wide) {
        panels.right.push(doorSegment(zone, slots, geometry));
      } else if (templateKey === 'side_by_side') {
        panels[zone.key === 'door' || geometryOf(zone).x >= 50 ? 'right' : 'left']
          .push(doorSegment(zone, slots, geometry));
      } else {
        splitIndex = Math.ceil(slots.length / 2);
        panels.left.push(doorSegment(zone, slots.slice(0, splitIndex), geometry));
        panels.right.push(doorSegment(zone, slots.slice(splitIndex), geometry));
      }
    }
    return panels;
  }

  function bandForY(bands, y) {
    var index;
    for (index = 0; index < bands.length; index += 1) {
      if (bands[index].sourceY === y) return bands[index];
    }
    return null;
  }

  function getCabinetBands(templateKey, cabinetZones) {
    var bands = [];
    var index;
    var zone;
    var geometry;
    var band;
    var total = 0;
    var top = 0;

    if (templateKey === 'mini' && cabinetZones.length) {
      bands.push({ sourceY: 0, sourceHeight: 50, zones: [cabinetZones[0]] });
      if (cabinetZones.length > 1) {
        bands.push({
          sourceY: 50,
          sourceHeight: 50,
          zones: [cabinetZones[cabinetZones.length - 1]]
        });
      }
    } else {
      for (index = 0; index < cabinetZones.length; index += 1) {
        zone = cabinetZones[index];
        geometry = geometryOf(zone);
        band = bandForY(bands, geometry.y);
        if (!band) {
          band = { sourceY: geometry.y, sourceHeight: geometry.height, zones: [] };
          bands.push(band);
        }
        band.zones.push(zone);
      }
      bands.sort(function (left, right) { return left.sourceY - right.sourceY; });
    }

    for (index = 0; index < bands.length; index += 1) total += bands[index].sourceHeight;
    if (!total) total = 1;
    for (index = 0; index < bands.length; index += 1) {
      band = bands[index];
      band.top = top;
      band.height = band.sourceHeight / total * 100;
      band.zones = band.zones.map(function (item, itemIndex) {
        return {
          zone: item,
          slots: item.slots || [],
          x: itemIndex * 100 / band.zones.length,
          width: 100 / band.zones.length,
          layoutKind: geometryOf(item).layoutKind
        };
      });
      top += band.height;
      delete band.sourceY;
      delete band.sourceHeight;
    }
    return bands;
  }

  function getWideCabinetZones(cabinetZones) {
    var output = [];
    var index;
    var zone;
    var geometry;
    for (index = 0; index < cabinetZones.length; index += 1) {
      zone = cabinetZones[index];
      geometry = geometryOf(zone);
      output.push({
        zone: zone,
        slots: zone.slots || [],
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        layoutKind: geometry.layoutKind
      });
    }
    return output;
  }

  function createFridgeRenderPlan(layout) {
    var zones = layout.zones || [];
    var cabinetZones = [];
    var doorZones = [];
    var wide = layout.template_key === 'side_by_side' || layout.template_key === 'french_door';
    var index;
    for (index = 0; index < zones.length; index += 1) {
      (zones[index].is_door ? doorZones : cabinetZones).push(zones[index]);
    }
    return {
      shell: getShellGeometry(layout.template_key),
      wide: wide,
      cabinetBands: wide ? [] : getCabinetBands(layout.template_key, cabinetZones),
      cabinetZones: wide ? getWideCabinetZones(cabinetZones) : [],
      doorPanels: getDoorPanels(layout.template_key, cabinetZones, doorZones),
      hingeTracks: wide
        ? [
          { after: 'left-door', positions: HINGE_POSITIONS.slice(0) },
          { after: 'cabinet', positions: HINGE_POSITIONS.slice(0) }
        ]
        : [{ after: 'cabinet', positions: HINGE_POSITIONS.slice(0) }]
    };
  }

  root.FridgeLayoutCore = {
    createFridgeRenderPlan: createFridgeRenderPlan,
    getDoorColdRegion: getDoorColdRegion,
    getShellGeometry: getShellGeometry
  };
}(typeof window !== 'undefined' ? window : globalThis));
