/* global Matter */
importScripts("./assets/matter.min.js?v=telegram133");

const STEP_MS = 1000 / 60;
const MAX_STEPS = 620;

function getGeometry(width, height, rows, profile) {
  const slotCount = rows + 1;
  const pegTop = 66;
  const horizontalInset = Math.max(
    profile.horizontalInsetMin,
    Math.min(profile.horizontalInsetMax, width * profile.horizontalInsetRatio)
  );
  const pegGap = (width - horizontalInset * 2) / Math.max(1, rows + 1);
  const pegBottom = Math.min(height - 124, Math.max(286, height * 0.715));
  const pegStep = rows > 1 ? (pegBottom - pegTop) / (rows - 1) : 0;
  const slotY = Math.min(height - 82, pegBottom + 18);
  const centerX = (index) => width / 2 + (index - (slotCount - 1) / 2) * pegGap;
  return { slotCount, pegTop, pegStep, pegGap, slotY, centerX };
}

function getPegPosition(row, col, width, geometry) {
  const count = row + 3;
  return {
    x: width / 2 + (col - (count - 1) / 2) * geometry.pegGap,
    y: geometry.pegTop + row * geometry.pegStep,
  };
}

function getTriangleBounds(y, geometry, width, rows, radius) {
  if (y < geometry.pegTop - 18) {
    return { left: width / 2 - 13, right: width / 2 + 13 };
  }
  const rowFloat = Math.max(0, Math.min(rows - 1, (y - geometry.pegTop) / Math.max(1, geometry.pegStep)));
  const visualCount = rowFloat + 3;
  const half = ((visualCount - 1) * geometry.pegGap) / 2 + geometry.pegGap * 0.58;
  const canvasPadding = Math.max(radius + 1, 2);
  return {
    left: Math.max(canvasPadding, width / 2 - half + radius),
    right: Math.min(width - canvasPadding, width / 2 + half - radius),
  };
}

function getSlotFromX(x, geometry) {
  let closest = 0;
  let closestDistance = Infinity;
  for (let index = 0; index < geometry.slotCount; index += 1) {
    const distance = Math.abs(geometry.centerX(index) - x);
    if (distance < closestDistance) {
      closest = index;
      closestDistance = distance;
    }
  }
  return closest;
}

function simulateDrop({ width, height, rows, profile }) {
  const { Engine, World, Bodies, Body, Events } = Matter;
  const geometry = getGeometry(width, height, rows, profile);
  const engine = Engine.create({ enableSleeping: false });
  engine.gravity.y = 0.92;
  engine.gravity.scale = 0.001;
  engine.positionIterations = 8;
  engine.velocityIterations = 6;

  const ball = Bodies.circle(width / 2 + (Math.random() - 0.5) * 1.2, 31.5, profile.ballRadius, {
    label: "ball",
    restitution: 0.52,
    friction: 0,
    frictionStatic: 0,
    frictionAir: 0.0026,
    density: 0.0016,
    slop: 0.01,
  });
  Body.setVelocity(ball, { x: (Math.random() - 0.5) * 0.42, y: 1.18 + Math.random() * 0.22 });

  const bodies = [ball];
  for (let row = 0; row < rows; row += 1) {
    const count = row + 3;
    for (let col = 0; col < count; col += 1) {
      const peg = getPegPosition(row, col, width, geometry);
      bodies.push(
        Bodies.circle(peg.x, peg.y, profile.pegRadius + 0.15, {
          label: `peg:${row}:${col}`,
          isStatic: true,
          restitution: 0.68,
          friction: 0,
          slop: 0.01,
        })
      );
    }
  }

  bodies.push(
    Bodies.rectangle(width / 2, geometry.slotY + 13, width, 8, {
      isStatic: true,
      render: { visible: false },
      restitution: 0.1,
    })
  );
  World.add(engine.world, bodies);

  let simTime = 0;
  const pegHits = [];
  Events.on(engine, "collisionStart", (event) => {
    event.pairs.forEach((pair) => {
      const labels = [pair.bodyA.label, pair.bodyB.label];
      const pegLabel = labels.find((label) => label.startsWith("peg:"));
      if (!pegLabel || !labels.includes("ball")) return;
      const [, row, col] = pegLabel.split(":").map(Number);
      if (Number.isFinite(row) && Number.isFinite(col)) {
        pegHits.push(simTime, row, col);
      }
    });
  });

  const frames = [];
  for (let step = 0; step < MAX_STEPS; step += 1) {
    simTime += STEP_MS;
    Engine.update(engine, STEP_MS);

    const bounds = getTriangleBounds(ball.position.y, geometry, width, rows, profile.ballRadius);
    const boundaryNudge = Math.max(2.2, profile.ballRadius * 0.55);
    if (ball.position.x < bounds.left) {
      Body.setPosition(ball, { x: bounds.left + boundaryNudge, y: ball.position.y });
      Body.setVelocity(ball, {
        x: Math.abs(ball.velocity.x) * 0.62 + 0.18 + Math.random() * 0.08,
        y: Math.max(ball.velocity.y, 0.72),
      });
    } else if (ball.position.x > bounds.right) {
      Body.setPosition(ball, { x: bounds.right - boundaryNudge, y: ball.position.y });
      Body.setVelocity(ball, {
        x: -Math.abs(ball.velocity.x) * 0.62 - 0.18 - Math.random() * 0.08,
        y: Math.max(ball.velocity.y, 0.72),
      });
    } else if (
      (ball.position.x - bounds.left < boundaryNudge || bounds.right - ball.position.x < boundaryNudge) &&
      Math.abs(ball.velocity.x) < 0.08 &&
      ball.velocity.y < 0.5
    ) {
      const pushRight = ball.position.x - bounds.left < bounds.right - ball.position.x;
      Body.setVelocity(ball, {
        x: pushRight ? 0.24 + Math.random() * 0.08 : -0.24 - Math.random() * 0.08,
        y: 0.76,
      });
    }

    frames.push(simTime, ball.position.x, ball.position.y);

    if (ball.position.y >= geometry.slotY - 5) break;
    if (step > 100 && Math.abs(ball.velocity.y) < 0.03) {
      Body.setVelocity(ball, {
        x: ball.velocity.x + (Math.random() < 0.5 ? -0.45 : 0.45),
        y: Math.max(ball.velocity.y, 0.85),
      });
    }
  }

  const lastOffset = Math.max(0, frames.length - 3);
  const lastTime = frames[lastOffset] || 0;
  const lastX = frames[lastOffset + 1] ?? width / 2;
  const slot = getSlotFromX(lastX, geometry);
  frames.push(lastTime + 70, geometry.centerX(slot), geometry.slotY - 5);

  World.clear(engine.world, false);
  Engine.clear(engine);
  const timeline = new Float32Array(frames);
  const hits = new Float32Array(pegHits);
  return { timeline, hits, slot, duration: timeline[timeline.length - 3] || 1200 };
}

self.onmessage = (event) => {
  const { id, config } = event.data || {};
  try {
    const result = simulateDrop(config);
    self.postMessage(
      {
        id,
        result: {
          timeline: result.timeline.buffer,
          hits: result.hits.buffer,
          slot: result.slot,
          duration: result.duration,
        },
      },
      [result.timeline.buffer, result.hits.buffer]
    );
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
