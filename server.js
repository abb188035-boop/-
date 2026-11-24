const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const boxes = [];
for (let i = 0; i < 35; i++) {
    const x = (Math.random() - 0.5) * 80;
    const z = (Math.random() - 0.5) * 80;
    if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;

    const w = 1.5 + Math.random() * 2.5;
    const h = 1.2 + Math.random() * 2.2;
    const d = 1.5 + Math.random() * 2.5;
    boxes.push({ x, y: h / 2, z, w, h, d });
}

const players = {};
const clientsById = {};

function randomSpawn() {
    return {
        x: (Math.random() - 0.5) * 24,
        y: 1.6,
        z: (Math.random() - 0.5) * 24
    };
}

wss.on('connection', (ws) => {
    const id = 'p_' + Math.random().toString(36).substr(2, 6);
    const color = Math.floor(Math.random() * 0xffffff);
    const sp = randomSpawn();

    clientsById[id] = ws;
    players[id] = {
        id,
        x: sp.x,
        y: sp.y,
        z: sp.z,
        ry: 0,
        hp: 100,
        color
    };

    ws.send(JSON.stringify({
        type: 'init',
        id,
        boxes,
        players
    }));

    broadcast({ type: 'playerJoined', player: players[id] }, ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (!players[id]) return;

            if (data.type === 'move') {
                players[id].x = data.x;
                players[id].y = data.y;
                players[id].z = data.z;
                players[id].ry = data.ry;

                broadcast({
                    type: 'playerMoved',
                    id,
                    x: data.x,
                    y: data.y,
                    z: data.z,
                    ry: data.ry
                }, ws);
            } else if (data.type === 'shoot') {
                broadcast({
                    type: 'shotFired',
                    shooterId: id,
                    origin: data.origin,
                    end: data.end
                }, ws);

                const targetId = data.hitPlayerId;
                if (targetId && players[targetId] && players[targetId].hp > 0) {
                    players[targetId].hp = Math.max(0, players[targetId].hp - 25);

                    broadcast({
                        type: 'playerHit',
                        targetId,
                        shooterId: id,
                        hp: players[targetId].hp
                    });

                    if (players[targetId].hp <= 0) {
                        const newSp = randomSpawn();
                        players[targetId].hp = 100;
                        players[targetId].x = newSp.x;
                        players[targetId].y = newSp.y;
                        players[targetId].z = newSp.z;

                        broadcast({
                            type: 'playerRespawn',
                            targetId,
                            x: newSp.x,
                            y: newSp.y,
                            z: newSp.z,
                            hp: 100
                        });
                    }
                }
            } else if (data.type === 'rtc-signal' && data.targetId) {
                const targetWs = clientsById[data.targetId];
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify({
                        type: 'rtc-signal',
                        fromId: id,
                        signal: data.signal
                    }));
                }
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        delete players[id];
        delete clientsById[id];
        broadcast({ type: 'playerLeft', id });
    });
});

function broadcast(data, excludeWs = null) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://127.0.0.1:${PORT}`);
});
