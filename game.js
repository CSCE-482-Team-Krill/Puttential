(() => {
    "use strict";
    const canvas = document.querySelector("#arena");
    const ctx = canvas.getContext("2d");
    const bagEl = document.querySelector("#fieldBag");
    const launchButton = document.querySelector("#launchButton");
    const undoButton = document.querySelector("#undoButton");
    const resetButton = document.querySelector("#resetButton");
    const clearButton = document.querySelector("#clearButton");
    const status = document.querySelector("#status");
    const winPanel = document.querySelector("#winPanel");
    const resultText = document.querySelector("#resultText");
    const W = canvas.width,
        H = canvas.height;
    const podStart = { x: 105, y: 503, vx: 162, vy: -78 };
    // A lopsided glider makes both the launch direction and collision spin easy to read.
    const seedShape = [
        { x: 21, y: 0 },
        { x: 7, y: 12 },
        { x: -2, y: 9 },
        { x: -12, y: 15 },
        { x: -19, y: 5 },
        { x: -16, y: -9 },
        { x: -5, y: -13 },
        { x: 9, y: -10 },
    ];
    const seedRadius = 20;
    const seedInertia = 220;
    const target = { x: 797, y: 184, r: 47 };
    const holdNeeded = 1;
    const physicsStep = 1 / 180;
    const previewSubsteps = 3;
    const storedRunSteps = 9000;
    const fieldDefs = [
        {
            type: "attract",
            force: "attract",
            name: "Attractor",
            icon: "↓",
            remaining: 1,
            color: "#c9f46b",
            description: "0.85× pull · 190 range",
            power: 0.85,
            radius: 45,
            range: 190,
        },
        {
            type: "bumper",
            force: "repel",
            name: "Bumper",
            icon: "↑",
            remaining: 1,
            color: "#ffad5c",
            description: "1.10× push · 185 range",
            power: 1.1,
            radius: 50,
            range: 185,
        },
        {
            type: "vortex",
            force: "vortex",
            name: "Vortex",
            icon: "↻",
            remaining: 1,
            color: "#c99cff",
            description: "clockwise curl",
            power: 1,
            radius: 68,
        },
        {
            type: "wedge",
            force: "wedge",
            name: "Boost wedge",
            icon: "→",
            remaining: 1,
            color: "#ffe27a",
            description: "rightward kick",
            power: 1,
            width: 126,
            height: 92,
        },
        {
            type: "brake",
            force: "brake",
            name: "Brake patch",
            icon: "≋",
            remaining: 1,
            color: "#91a6ad",
            description: "heavy drag",
            power: 1,
            radius: 61,
        },
    ];
    const obstacles = [
        {
            name: "launch fin",
            points: [
                { x: 196, y: 427 },
                { x: 235, y: 391 },
                { x: 263, y: 479 },
                { x: 225, y: 500 },
            ],
        },
        {
            name: "switchback",
            points: [
                { x: 350, y: 224 },
                { x: 396, y: 207 },
                { x: 493, y: 382 },
                { x: 452, y: 409 },
            ],
        },
        {
            name: "prism",
            points: [
                { x: 510, y: 388 },
                { x: 571, y: 343 },
                { x: 639, y: 385 },
                { x: 621, y: 459 },
                { x: 548, y: 463 },
            ],
        },
        {
            name: "crown bank",
            points: [
                { x: 596, y: 100 },
                { x: 688, y: 65 },
                { x: 754, y: 99 },
                { x: 715, y: 137 },
                { x: 640, y: 124 },
            ],
        },
        {
            name: "cup guard",
            points: [
                { x: 760, y: 293 },
                { x: 851, y: 276 },
                { x: 867, y: 313 },
                { x: 782, y: 337 },
            ],
        },
    ];
    let selected = null,
        fields = [],
        launched = false,
        won = false,
        insideTime = 0,
        elapsed = 0,
        lastTime = 0,
        physicsAccumulator = 0,
        cursor = null,
        dragField = null;
    let pod = newSeed();
    let runPath = [], runStep = 0;

    function newSeed() {
        return {
            ...podStart,
            radius: seedRadius,
            angle: 0.24,
            angularVelocity: 0,
            invMass: 1,
            invInertia: 1 / seedInertia,
        };
    }

    function defFor(type) {
        return fieldDefs.find((d) => d.type === type);
    }
    function renderBag() {
        bagEl.innerHTML = "";
        fieldDefs.forEach((def) => {
            const button = document.createElement("button");
            button.className = `field-card ${def.force}${selected === def.type ? " active" : ""}`;
            button.disabled = launched || def.remaining === 0;
            button.draggable = !button.disabled;
            button.innerHTML = `<span class="icon">${def.icon}</span><span><strong>${def.name}</strong><small>${def.description} · fixed strength</small></span><span class="count">${def.remaining}</span>`;
            button.addEventListener("click", () => {
                selected = selected === def.type ? null : def.type;
                renderBag();
                updateStatus();
            });
            button.addEventListener("dragstart", (event) => {
                selected = def.type;
                event.dataTransfer.setData("text/plain", def.type);
                event.dataTransfer.effectAllowed = "copy";
                updateStatus("Drop it anywhere on the green.");
            });
            bagEl.append(button);
        });
    }
    function updateStatus(message) {
        if (message) {
            status.textContent = message;
            return;
        }
        if (won) status.textContent = "Hole complete.";
        else if (launched)
            status.textContent = `Cup charge: ${Math.min(100, (insideTime / holdNeeded) * 100).toFixed(0)}%`;
        else if (selected)
            status.textContent = `Drag or place the ${defFor(selected).name.toLowerCase()}.`;
        else status.textContent = "Drag a field from your bag onto the green.";
    }
    function canvasPoint(event) {
        const r = canvas.getBoundingClientRect();
        return {
            x: ((event.clientX - r.left) * W) / r.width,
            y: ((event.clientY - r.top) * H) / r.height,
        };
    }
    function clearRun(all = false) {
        launched = false;
        won = false;
        insideTime = 0;
        elapsed = 0;
        physicsAccumulator = 0;
        runPath = [];
        runStep = 0;
        cursor = null;
        dragField = null;
        pod = newSeed();
        winPanel.classList.add("hidden");
        if (all) {
            fields = [];
            fieldDefs.forEach((f) => (f.remaining = 1));
            selected = null;
        }
        renderBag();
        updateStatus();
    }
    function validPosition(p) {
        return (
            p.x > 28 &&
            p.x < W - 28 &&
            p.y > 28 &&
            p.y < H - 28 &&
            Math.hypot(p.x - podStart.x, p.y - podStart.y) > 48 &&
            Math.hypot(p.x - target.x, p.y - target.y) > target.r + 20
        );
    }
    function place(type, p) {
        const def = defFor(type);
        if (!def || !def.remaining || !validPosition(p)) {
            updateStatus("Keep fields clear of the tee and cup.");
            return false;
        }
        fields.push({ x: p.x, y: p.y, type, force: def.force, power: def.power });
        def.remaining--;
        selected = null;
        renderBag();
        updateStatus();
        return true;
    }
    function wedgePoints(field, def = defFor(field.type)) {
        return [
            { x: field.x - def.width / 2, y: field.y - def.height / 2 },
            { x: field.x - def.width / 2, y: field.y + def.height / 2 },
            { x: field.x + def.width / 2, y: field.y },
        ];
    }
    function pointInPolygon(p, points) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[i],
                b = points[j];
            if (
                a.y > p.y !== b.y > p.y &&
                p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
            )
                inside = !inside;
        }
        return inside;
    }
    function seedVertices(body) {
        const cos = Math.cos(body.angle), sin = Math.sin(body.angle);
        return seedShape.map((point) => ({
            x: body.x + point.x * cos - point.y * sin,
            y: body.y + point.x * sin + point.y * cos,
        }));
    }
    function seedSamplePoints(body) {
        const cos = Math.cos(body.angle), sin = Math.sin(body.angle);
        const localPoints = [{ x: 0, y: 0 }];
        seedShape.forEach((point, index) => {
            const next = seedShape[(index + 1) % seedShape.length];
            localPoints.push(point, {
                x: (point.x + next.x) / 2,
                y: (point.y + next.y) / 2,
            });
        });
        return localPoints.map((point) => ({
            x: body.x + point.x * cos - point.y * sin,
            y: body.y + point.x * sin + point.y * cos,
        }));
    }
    function applyForce(body, point, x, y, dt) {
        body.vx += x * body.invMass * dt;
        body.vy += y * body.invMass * dt;
        const rx = point.x - body.x, ry = point.y - body.y;
        body.angularVelocity += (rx * y - ry * x) * body.invInertia * dt;
    }
    function applyFieldForces(body, dt, list = fields) {
        const samples = seedSamplePoints(body);
        const weight = 1 / samples.length;
        for (const field of list) {
            const def = defFor(field.type);
            for (const point of samples) {
                const dx = field.x - point.x, dy = field.y - point.y;
                const d2 = dx * dx + dy * dy;
                const distance = Math.sqrt(d2) || 1;
                if (field.force === "wedge") {
                    if (pointInPolygon(point, wedgePoints(field)))
                        applyForce(body, point, 470 * field.power * weight, 0, dt);
                    continue;
                }
                if (field.force === "brake") {
                    if (distance < def.radius) {
                        const rx = point.x - body.x, ry = point.y - body.y;
                        const pointVX = body.vx - body.angularVelocity * ry;
                        const pointVY = body.vy + body.angularVelocity * rx;
                        applyForce(body, point, -pointVX * 2.4 * field.power * weight, -pointVY * 2.4 * field.power * weight, dt);
                    }
                    continue;
                }
                if (field.force === "vortex") {
                    if (distance < def.radius) {
                        const falloff = 1 - distance / def.radius;
                        applyForce(
                            body,
                            point,
                            ((-dy / distance) * 330 - (dx / distance) * 100) * falloff * field.power * weight,
                            ((dx / distance) * 330 - (dy / distance) * 100) * falloff * field.power * weight,
                            dt,
                        );
                    }
                    continue;
                }
                if (distance >= def.range) continue;
                const falloff = Math.pow(1 - distance / def.range, 0.7);
                const magnitude = (270000 * field.power * falloff * weight) / Math.max(d2, 36 * 36);
                const direction = field.force === "attract" ? 1 : -1;
                applyForce(body, point, (direction * dx * magnitude) / distance, (direction * dy * magnitude) / distance, dt);
            }
        }
    }
    function polygonCenter(points) {
        const sum = points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 });
        return { x: sum.x / points.length, y: sum.y / points.length };
    }
    function axesFor(points) {
        return points.map((point, index) => {
            const next = points[(index + 1) % points.length];
            const x = -(next.y - point.y), y = next.x - point.x, length = Math.hypot(x, y);
            return { x: x / length, y: y / length };
        });
    }
    function projection(points, axis) {
        const values = points.map((point) => point.x * axis.x + point.y * axis.y);
        return { min: Math.min(...values), max: Math.max(...values) };
    }
    function supportPoint(points, direction) {
        return points.reduce((best, point) => point.x * direction.x + point.y * direction.y > best.x * direction.x + best.y * direction.y ? point : best);
    }
    function resolveStaticCollision(body, normal, penetration, contact) {
        body.x += normal.x * (penetration + 0.02);
        body.y += normal.y * (penetration + 0.02);
        const rx = contact.x - body.x, ry = contact.y - body.y;
        const contactVX = body.vx - body.angularVelocity * ry;
        const contactVY = body.vy + body.angularVelocity * rx;
        const approach = contactVX * normal.x + contactVY * normal.y;
        if (approach >= 0) return;
        const rotationTerm = rx * normal.y - ry * normal.x;
        const impulseSize = (-(1.72 * approach)) / (body.invMass + rotationTerm * rotationTerm * body.invInertia);
        const impulseX = impulseSize * normal.x, impulseY = impulseSize * normal.y;
        body.vx += impulseX * body.invMass;
        body.vy += impulseY * body.invMass;
        body.angularVelocity += (rx * impulseY - ry * impulseX) * body.invInertia;
    }
    function collidePolygon(body, obstacle) {
        const moving = seedVertices(body), stationary = obstacle.points;
        const movingCenter = polygonCenter(moving), stationaryCenter = polygonCenter(stationary);
        let bestOverlap = Infinity, bestNormal = null;
        for (const axis of [...axesFor(moving), ...axesFor(stationary)]) {
            const a = projection(moving, axis), b = projection(stationary, axis);
            const overlap = Math.min(a.max, b.max) - Math.max(a.min, b.min);
            if (overlap <= 0) return;
            let normal = axis;
            if ((movingCenter.x - stationaryCenter.x) * normal.x + (movingCenter.y - stationaryCenter.y) * normal.y < 0) normal = { x: -normal.x, y: -normal.y };
            if (overlap < bestOverlap) { bestOverlap = overlap; bestNormal = normal; }
        }
        const contact = supportPoint(moving, { x: -bestNormal.x, y: -bestNormal.y });
        resolveStaticCollision(body, bestNormal, bestOverlap, contact);
    }
    function collideWalls(body) {
        const pad = 10;
        let vertices = seedVertices(body), point = vertices.reduce((best, vertex) => vertex.x < best.x ? vertex : best);
        if (point.x < pad) resolveStaticCollision(body, { x: 1, y: 0 }, pad - point.x, point);
        vertices = seedVertices(body); point = vertices.reduce((best, vertex) => vertex.x > best.x ? vertex : best);
        if (point.x > W - pad) resolveStaticCollision(body, { x: -1, y: 0 }, point.x - (W - pad), point);
        vertices = seedVertices(body); point = vertices.reduce((best, vertex) => vertex.y < best.y ? vertex : best);
        if (point.y < pad) resolveStaticCollision(body, { x: 0, y: 1 }, pad - point.y, point);
        vertices = seedVertices(body); point = vertices.reduce((best, vertex) => vertex.y > best.y ? vertex : best);
        if (point.y > H - pad) resolveStaticCollision(body, { x: 0, y: -1 }, point.y - (H - pad), point);
    }
    function step(body, dt, list = fields) {
        applyFieldForces(body, dt, list);
        const drag = Math.exp(-0.095 * dt);
        body.vx *= drag;
        body.vy *= drag;
        body.angularVelocity *= Math.exp(-0.22 * dt);
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        body.angle += body.angularVelocity * dt;
        collideWalls(body);
        obstacles.forEach((obstacle) => collidePolygon(body, obstacle));
    }
    // A fixed step keeps browser frame timing from changing the collision path.
    function advancePod(body, steps = 1, list = fields) {
        for (let i = 0; i < steps; i++) step(body, physicsStep, list);
    }
    function podInCup(body) {
        return Math.hypot(body.x - target.x, body.y - target.y) < target.r - body.radius * 0.35;
    }
    function buildRunPath(steps = storedRunSteps) {
        const simulation = newSeed();
        const path = [];
        for (let i = 0; i < steps; i++) {
            advancePod(simulation);
            path.push({ ...simulation });
        }
        return path;
    }
    function drawCourse() {
        ctx.fillStyle = "#173b31";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#255c3f";
        ctx.fillRect(18, 18, W - 36, H - 36);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(48, 532);
        ctx.bezierCurveTo(192, 570, 234, 417, 355, 410);
        ctx.bezierCurveTo(470, 404, 466, 511, 599, 505);
        ctx.bezierCurveTo(749, 498, 684, 323, 794, 202);
        ctx.lineTo(842, 171);
        ctx.lineTo(856, 228);
        ctx.bezierCurveTo(737, 334, 814, 548, 610, 567);
        ctx.bezierCurveTo(451, 582, 427, 465, 345, 468);
        ctx.bezierCurveTo(242, 473, 220, 603, 47, 580);
        ctx.closePath();
        ctx.fillStyle = "rgba(185, 224, 120, .18)";
        ctx.fill();
        ctx.clip();
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = "#d4eea1";
        ctx.lineWidth = 2;
        for (let x = -H; x < W + H; x += 28) {
            ctx.beginPath();
            ctx.moveTo(x, H);
            ctx.lineTo(x + H, 0);
            ctx.stroke();
        }
        ctx.restore();
        ctx.save();
        ctx.setLineDash([3, 10]);
        ctx.strokeStyle = "rgba(215, 242, 170, .24)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(484, 326, 218, Math.PI * 0.08, Math.PI * 1.64);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = "#dcb569";
        ctx.lineWidth = 11;
        ctx.strokeRect(7, 7, W - 14, H - 14);
        ctx.strokeStyle = "#54351d";
        ctx.lineWidth = 2;
        ctx.strokeRect(7, 7, W - 14, H - 14);
    }
    function drawObstacle(obstacle) {
        const p = obstacle.points;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p[0].x, p[0].y);
        p.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.closePath();
        ctx.fillStyle = "#ba7545";
        ctx.fill();
        ctx.strokeStyle = "#5c301b";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = "rgba(255,228,173,.35)";
        ctx.lineWidth = 3;
        for (let x = -H; x < W + H; x += 14) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + H, H);
            ctx.stroke();
        }
        ctx.restore();
        ctx.restore();
    }
    function drawTarget() {
        const pulse = launched
            ? 1 + Math.sin(performance.now() / 160) * 0.035
            : 1;
        ctx.save();
        ctx.translate(target.x, target.y);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = "rgba(22,28,17,.35)";
        ctx.beginPath();
        ctx.arc(4, 5, target.r + 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1a2315";
        ctx.beginPath();
        ctx.arc(0, 0, target.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#f6e99c";
        ctx.lineWidth = 3;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.arc(
            0,
            0,
            target.r,
            -Math.PI / 2,
            -Math.PI / 2 + (Math.PI * 2 * insideTime) / holdNeeded,
        );
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "#e6d777";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -target.r);
        ctx.lineTo(0, -target.r - 75);
        ctx.stroke();
        ctx.fillStyle = "#f36e5e";
        ctx.beginPath();
        ctx.moveTo(0, -target.r - 74);
        ctx.lineTo(45, -target.r - 60);
        ctx.lineTo(0, -target.r - 45);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ece4b5";
        ctx.font = "700 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("CUP", 0, 4);
        ctx.restore();
    }
    function drawField(f, ghost = false) {
        const style = defFor(f.type);
        ctx.save();
        ctx.globalAlpha = ghost ? 0.48 : 1;
        ctx.translate(f.x, f.y);
        if (style.force === "wedge") {
            const points = wedgePoints({ x: 0, y: 0 }, style);
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
            ctx.closePath();
            ctx.fillStyle = "rgba(255,226,122,.26)";
            ctx.strokeStyle = style.color;
            ctx.lineWidth = 3;
            ctx.fill();
            ctx.stroke();
            ctx.lineCap = "round";
            for (let y = -17; y <= 17; y += 17) {
                ctx.beginPath();
                ctx.moveTo(-style.width / 2 + 14, y);
                ctx.lineTo(style.width / 2 - 14, y);
                ctx.lineTo(style.width / 2 - 25, y - 8);
                ctx.moveTo(style.width / 2 - 14, y);
                ctx.lineTo(style.width / 2 - 25, y + 8);
                ctx.stroke();
            }
        } else if (style.force === "vortex") {
            ctx.strokeStyle = style.color;
            ctx.lineWidth = 2;
            for (let r = style.radius; r >= 20; r -= 16) {
                ctx.globalAlpha = (ghost ? 0.18 : 0.34) + (style.radius - r) / 400;
                ctx.beginPath();
                ctx.arc(0, 0, r, -Math.PI * 0.18, Math.PI * 1.4);
                ctx.stroke();
            }
            ctx.globalAlpha = ghost ? 0.5 : 1;
            ctx.fillStyle = style.color;
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#2a1e3a";
            ctx.font = "900 18px system-ui";
            ctx.textAlign = "center";
            ctx.fillText("↻", 0, 7);
        } else if (style.force === "brake") {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = -Math.PI / 2 + (i * Math.PI) / 3;
                const x = Math.cos(angle) * style.radius, y = Math.sin(angle) * style.radius;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fillStyle = "rgba(145,166,173,.30)";
            ctx.strokeStyle = style.color;
            ctx.lineWidth = 3;
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = "rgba(237,247,245,.7)";
            ctx.lineWidth = 2;
            for (let y = -24; y <= 24; y += 12) {
                ctx.beginPath();
                ctx.moveTo(-27, y);
                ctx.lineTo(27, y);
                ctx.stroke();
            }
        } else {
            // The outer dashed ring is the hard range limit for point forces.
            if (style.range) {
                ctx.fillStyle = style.color;
                ctx.globalAlpha = ghost ? 0.035 : 0.07;
                ctx.beginPath();
                ctx.arc(0, 0, style.range, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = ghost ? 0.3 : 0.58;
                ctx.strokeStyle = style.color;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([7, 6]);
                ctx.beginPath();
                ctx.arc(0, 0, style.range, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            for (let r = style.radius; r >= 16; r -= 15) {
                ctx.strokeStyle = style.color;
                ctx.globalAlpha = (ghost ? 0.08 : 0.12) + (style.radius - r) / 600;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = ghost ? 0.5 : 1;
            ctx.fillStyle = style.color;
            ctx.beginPath();
            ctx.arc(0, 0, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#243117";
            ctx.font = "900 19px system-ui";
            ctx.textAlign = "center";
            ctx.fillText(style.force === "attract" ? "−" : "+", 0, 7);
        }
        ctx.restore();
    }
    function drawTrajectory() {
        if (launched || won) return;
        const test = newSeed();
        ctx.save();
        ctx.fillStyle = "rgba(255,255,229,.75)";
        for (let i = 0; i < 1000; i++) {
            let reachedCup = false;
            for (let j = 0; j < previewSubsteps; j++) {
                advancePod(test);
                if (podInCup(test)) {
                    reachedCup = true;
                    break;
                }
            }
            ctx.beginPath();
            ctx.arc(test.x, test.y, 1.4, 0, Math.PI * 2);
            ctx.fill();
            if (reachedCup) break;
        }
        ctx.restore();
    }
    function drawPod() {
        ctx.save();
        ctx.translate(pod.x, pod.y);
        ctx.fillStyle = "rgba(20,44,17,.28)";
        ctx.beginPath();
        ctx.ellipse(5, 8, 19, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(pod.angle);
        ctx.fillStyle = "#fffdf2";
        ctx.beginPath();
        ctx.moveTo(seedShape[0].x, seedShape[0].y);
        seedShape.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#d8d1b3";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.strokeStyle = "#5f9a73";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-13, 2);
        ctx.lineTo(7, -4);
        ctx.lineTo(16, 0);
        ctx.moveTo(-5, -9);
        ctx.lineTo(1, 7);
        ctx.stroke();
        ctx.fillStyle = "#ef9b55";
        ctx.beginPath();
        ctx.moveTo(-16, -8);
        ctx.lineTo(-5, -13);
        ctx.lineTo(-6, -3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    function draw() {
        ctx.clearRect(0, 0, W, H);
        drawCourse();
        obstacles.forEach(drawObstacle);
        drawTarget();
        fields.forEach((f) => drawField(f));
        if (!launched && selected && cursor)
            drawField({ x: cursor.x, y: cursor.y, type: selected }, true);
        drawTrajectory();
        drawPod();
        ctx.fillStyle = "#f7e5a5";
        ctx.font = "800 12px system-ui";
        ctx.textAlign = "left";
        ctx.fillText("TEE", 70, 548);
    }
    function loop(now) {
        const dt = Math.min((now - lastTime) / 1000 || 0, 1 / 30);
        lastTime = now;
        if (launched && !won) {
            physicsAccumulator += dt;
            while (physicsAccumulator >= physicsStep && !won) {
                if (runStep < runPath.length) pod = { ...runPath[runStep++] };
                else advancePod(pod);
                elapsed += physicsStep;
                insideTime = podInCup(pod)
                    ? Math.min(holdNeeded, insideTime + physicsStep)
                    : Math.max(0, insideTime - physicsStep * 0.35);
                physicsAccumulator -= physicsStep;
                if (insideTime >= holdNeeded) {
                    won = true;
                    launched = false;
                    renderBag();
                    const used = fields.length;
                    resultText.textContent = `${used === 0 ? "A perfect zero-field solve." : `${used} ${used === 1 ? "field" : "fields"} used`} · ${elapsed.toFixed(1)} s simulated`;
                    winPanel.classList.remove("hidden");
                }
            }
            updateStatus();
        }
        draw();
        requestAnimationFrame(loop);
    }
    function moveField(index, p) {
        if (validPosition(p)) {
            fields[index].x = p.x;
            fields[index].y = p.y;
        }
    }
    function eventOverBag(event) {
        const box = bagEl.getBoundingClientRect();
        return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    }
    canvas.addEventListener("pointermove", (event) => {
        cursor = canvasPoint(event);
        if (dragField !== null) moveField(dragField, cursor);
    });
    canvas.addEventListener("pointerleave", () => {
        if (dragField === null) cursor = null;
    });
    canvas.addEventListener("pointerdown", (event) => {
        if (launched || won) return;
        const p = canvasPoint(event);
        const found = fields.findIndex(
            (f) => Math.hypot(f.x - p.x, f.y - p.y) < 26,
        );
        if (found >= 0) {
            dragField = found;
            canvas.setPointerCapture(event.pointerId);
            updateStatus("Drag the field to reposition it.");
            return;
        }
        if (selected) place(selected, p);
    });
    canvas.addEventListener("pointerup", (event) => {
        if (dragField !== null) {
            if (eventOverBag(event)) {
                const [returned] = fields.splice(dragField, 1);
                defFor(returned.type).remaining++;
                renderBag();
                updateStatus(`${defFor(returned.type).name} returned to your bag.`);
            }
            dragField = null;
            if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
            if (!eventOverBag(event)) updateStatus();
        }
    });
    canvas.addEventListener("dragover", (event) => event.preventDefault());
    canvas.addEventListener("drop", (event) => {
        event.preventDefault();
        if (!launched && !won)
            place(event.dataTransfer.getData("text/plain"), canvasPoint(event));
    });
    launchButton.addEventListener("click", () => {
        if (!launched && !won) {
            // The live run replays this exact fixed-step prediction. Fields are
            // locked after launch, so the path cannot change underneath it.
            runPath = buildRunPath();
            runStep = 0;
            physicsAccumulator = 0;
            launched = true;
            selected = null;
            renderBag();
            updateStatus("Ball launched. Hold it in the cup!");
        }
    });
    undoButton.addEventListener("click", () => {
        if (launched || !fields.length) return;
        const removed = fields.pop();
        defFor(removed.type).remaining++;
        renderBag();
        updateStatus();
    });
    resetButton.addEventListener("click", () => clearRun(false));
    clearButton.addEventListener("click", () => clearRun(true));
    document
        .querySelector("#playAgainButton")
        .addEventListener("click", () => clearRun(false));
    window.addEventListener("keydown", (event) => {
        if (event.key.toLowerCase() === "r") clearRun(false);
        if (event.key === "Backspace") {
            event.preventDefault();
            undoButton.click();
        }
    });
    renderBag();
    updateStatus();
    requestAnimationFrame(loop);
})();
