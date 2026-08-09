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

  root.KindleLayout = {
    getFoodIconPositions: getFoodIconPositions,
    hashString: hashString
  };
}(typeof window !== 'undefined' ? window : this));
