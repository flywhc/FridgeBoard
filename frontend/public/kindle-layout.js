(function (root) {
  var FOOD_EDGE_GAP = 2;
  var FOOD_ICON_WIDTH = 40;
  var FOOD_ICON_HEIGHT = 40;

  function imul(left, right) {
    var leftLow = left & 65535;
    var leftHigh = left >>> 16;
    var rightLow = right & 65535;
    var rightHigh = right >>> 16;
    return (leftLow * rightLow + ((leftHigh * rightLow + leftLow * rightHigh) << 16)) | 0;
  }

  function hashString(value) {
    var hash = 2166136261;
    var index;
    for (index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function halton(index, base) {
    var result = 0;
    var factor = 1 / base;
    var value = index;
    while (value > 0) {
      result += factor * (value % base);
      value = Math.floor(value / base);
      factor /= base;
    }
    return result;
  }

  function foodSpreadScore(candidate, selected, width, height) {
    var usableWidth = Math.max(width - FOOD_EDGE_GAP * 2 - FOOD_ICON_WIDTH, 1);
    var usableHeight = Math.max(height - FOOD_EDGE_GAP * 2 - FOOD_ICON_HEIGHT, 1);
    var candidateX = FOOD_EDGE_GAP + candidate.x * usableWidth + FOOD_ICON_WIDTH / 2;
    var candidateY = FOOD_EDGE_GAP + candidate.y * usableHeight + FOOD_ICON_HEIGHT / 2;
    var score = Infinity;
    var index;
    var position;
    var positionX;
    var positionY;
    var horizontal;
    var vertical;
    var distance;

    for (index = 0; index < selected.length; index += 1) {
      position = selected[index];
      positionX = FOOD_EDGE_GAP + position.x * usableWidth + FOOD_ICON_WIDTH / 2;
      positionY = FOOD_EDGE_GAP + position.y * usableHeight + FOOD_ICON_HEIGHT / 2;
      horizontal = Math.abs(candidateX - positionX) / FOOD_ICON_WIDTH;
      vertical = Math.abs(candidateY - positionY) / FOOD_ICON_HEIGHT;
      distance = Math.sqrt(horizontal * horizontal + vertical * vertical);
      score = Math.min(score, Math.min(horizontal, vertical) + distance * 0.35);
    }
    return score;
  }

  function relaxFoodPositions(positions, width, height) {
    var usableWidth = Math.max(width - FOOD_EDGE_GAP * 2 - FOOD_ICON_WIDTH, 1);
    var usableHeight = Math.max(height - FOOD_EDGE_GAP * 2 - FOOD_ICON_HEIGHT, 1);
    var relaxed = [];
    var iteration;
    var left;
    var right;
    var horizontal;
    var vertical;
    var distance;
    var safeDistance;
    var push;
    var shifts;
    var index;

    for (index = 0; index < positions.length; index += 1) {
      relaxed.push({ x: positions[index].x, y: positions[index].y });
    }
    for (iteration = 0; iteration < 3; iteration += 1) {
      shifts = [];
      for (index = 0; index < relaxed.length; index += 1) shifts.push({ x: 0, y: 0 });
      for (left = 0; left < relaxed.length; left += 1) {
        for (right = left + 1; right < relaxed.length; right += 1) {
          horizontal = (relaxed[left].x - relaxed[right].x) * usableWidth;
          vertical = (relaxed[left].y - relaxed[right].y) * usableHeight;
          distance = Math.sqrt(
            Math.pow(horizontal / FOOD_ICON_WIDTH, 2) +
            Math.pow(vertical / FOOD_ICON_HEIGHT, 2)
          );
          if (distance >= 1.1) continue;
          safeDistance = Math.max(distance, 0.01);
          push = (1.1 - safeDistance) / safeDistance * 0.08;
          shifts[left].x += horizontal / usableWidth * push;
          shifts[left].y += vertical / usableHeight * push;
          shifts[right].x -= horizontal / usableWidth * push;
          shifts[right].y -= vertical / usableHeight * push;
        }
      }
      for (index = 0; index < relaxed.length; index += 1) {
        relaxed[index] = {
          x: Math.min(1, Math.max(0, relaxed[index].x + shifts[index].x)),
          y: Math.min(1, Math.max(0, relaxed[index].y + shifts[index].y))
        };
      }
    }
    return relaxed;
  }

  function getFoodIconPositions(itemKeys, width, height) {
    var count = itemKeys.length;
    var candidateCount;
    var seed;
    var candidates = [];
    var selected = [];
    var index;
    var sequenceIndex;
    var candidateIndex;
    var bestCandidate;
    var bestScore;
    var score;
    var duplicate;
    var rotation;
    var relaxed;
    var result = [];

    if (!count) return result;
    if (count === 1) return [{ x: 0.5, y: 0.5 }];
    width = width || 180;
    height = height || 64;
    candidateCount = Math.max(96, count * 24);
    seed = hashString(itemKeys.join('\u001f'));
    for (index = 0; index < candidateCount; index += 1) {
      sequenceIndex = index + 1 + seed % 17;
      candidates.push({ x: halton(sequenceIndex, 2), y: halton(sequenceIndex, 3) });
    }
    selected.push(candidates[seed % candidates.length]);
    while (selected.length < count) {
      bestCandidate = candidates[0];
      bestScore = -Infinity;
      for (candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        duplicate = false;
        for (index = 0; index < selected.length; index += 1) {
          if (
            selected[index].x === candidates[candidateIndex].x &&
            selected[index].y === candidates[candidateIndex].y
          ) {
            duplicate = true;
            break;
          }
        }
        if (duplicate) continue;
        score = foodSpreadScore(candidates[candidateIndex], selected, width, height);
        if (score > bestScore) {
          bestCandidate = candidates[candidateIndex];
          bestScore = score;
        }
      }
      selected.push(bestCandidate);
    }
    rotation = seed % selected.length;
    relaxed = relaxFoodPositions(selected, width, height);
    for (index = 0; index < count; index += 1) {
      result.push(relaxed[(index + rotation) % relaxed.length]);
    }
    return result;
  }

  function numberOr(value, fallback) {
    return typeof value === 'number' ? value : fallback;
  }

  function zoneGeometry(zone) {
    var geometry = zone.geometry || {};
    return {
      x: numberOr(geometry.x, 0),
      y: numberOr(geometry.y, 0),
      width: numberOr(geometry.width, 100),
      height: numberOr(geometry.height, 100)
    };
  }

  function panelZone(zone, x, y, width, height, slots) {
    var geometry = zoneGeometry(zone);
    var output = {
      key: zone.key,
      x: x,
      y: y,
      width: width,
      height: height,
      slots: []
    };
    var index;
    var slot;
    var slotGeometry;

    for (index = 0; index < slots.length; index += 1) {
      slot = slots[index];
      slotGeometry = slot.geometry || {};
      if (width === 100 && height === geometry.height && y === geometry.y && zone.is_door) {
        output.slots.push({
          id: slot.id,
          x: 0,
          y: index * 100 / Math.max(slots.length, 1),
          width: 100,
          height: 100 / Math.max(slots.length, 1)
        });
      } else {
        output.slots.push({
          id: slot.id,
          x: numberOr(slotGeometry.x, geometry.x) - geometry.x,
          y: numberOr(slotGeometry.y, geometry.y) - geometry.y,
          width: numberOr(slotGeometry.width, geometry.width),
          height: numberOr(slotGeometry.height, geometry.height)
        });
        output.slots[index].x = output.slots[index].x / Math.max(geometry.width, 1) * 100;
        output.slots[index].y = output.slots[index].y / Math.max(geometry.height, 1) * 100;
        output.slots[index].width = output.slots[index].width / Math.max(geometry.width, 1) * 100;
        output.slots[index].height = output.slots[index].height / Math.max(geometry.height, 1) * 100;
      }
    }
    return output;
  }

  function getThumbnailLayout(layout) {
    var wide = layout.template_key === 'side_by_side' || layout.template_key === 'french_door';
    var panels = [
      { key: 'door-left', zones: [] },
      { key: 'cabinet', zones: [] },
      { key: 'door-right', zones: [] }
    ];
    var zones = layout.zones || [];
    var index;
    var zone;
    var geometry;
    var splitIndex;
    var leftSlots;
    var rightSlots;

    for (index = 0; index < zones.length; index += 1) {
      zone = zones[index];
      geometry = zoneGeometry(zone);
      if (!zone.is_door) {
        panels[1].zones.push(panelZone(zone, geometry.x, geometry.y, geometry.width, geometry.height, zone.slots || []));
      } else if (!wide) {
        panels[2].zones.push(panelZone(zone, 0, geometry.y, 100, geometry.height, zone.slots || []));
      } else if (layout.template_key === 'side_by_side') {
        panels[geometry.x >= 50 || zone.key === 'door' ? 2 : 0].zones.push(
          panelZone(zone, 0, geometry.y, 100, geometry.height, zone.slots || [])
        );
      } else {
        splitIndex = Math.ceil((zone.slots || []).length / 2);
        leftSlots = (zone.slots || []).slice(0, splitIndex);
        rightSlots = (zone.slots || []).slice(splitIndex);
        if (leftSlots.length) panels[0].zones.push(panelZone(zone, 0, geometry.y, 100, geometry.height, leftSlots));
        if (rightSlots.length) panels[2].zones.push(panelZone(zone, 0, geometry.y, 100, geometry.height, rightSlots));
      }
    }
    return { wide: wide, panels: panels };
  }

  root.KindleLayout = {
    getFoodIconPositions: getFoodIconPositions,
    getThumbnailLayout: getThumbnailLayout,
    hashString: hashString
  };
}(typeof window !== 'undefined' ? window : this));
