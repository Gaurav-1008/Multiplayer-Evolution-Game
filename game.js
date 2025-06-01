// Game Configuration
const CONFIG = {
    WORLD_WIDTH: 4000,
    WORLD_HEIGHT: 4000,
    PLAYER_SPEED: 3.5,
    BOT_SPEED: 2.8,
    FOOD_COUNT: 800,
    BOT_COUNT: 25,
    EVOLUTION_STAGES: [
        { level: 1, size: 15, color: '#4CAF50', name: '🟢 Blob', scoreNeeded: 0 },
        { level: 2, size: 20, color: '#2196F3', name: '🔵 Crawler', scoreNeeded: 50 },
        { level: 3, size: 25, color: '#FF9800', name: '🟠 Hunter', scoreNeeded: 150 },
        { level: 4, size: 30, color: '#E91E63', name: '🔴 Predator', scoreNeeded: 300 },
        { level: 5, size: 35, color: '#9C27B0', name: '🟣 Beast', scoreNeeded: 500 },
        { level: 6, size: 40, color: '#F44336', name: '🔥 Monster', scoreNeeded: 800 },
        { level: 7, size: 45, color: '#FF5722', name: '👹 Demon', scoreNeeded: 1200 },
        { level: 8, size: 50, color: '#795548', name: '🐉 Dragon', scoreNeeded: 1800 }
    ]
};

// Game State
let canvas, ctx, minimapCanvas, minimapCtx;
let camera = { x: 0, y: 0 };
let player = null;
let bots = [];
let food = [];
let gameRunning = false;
let gameStarted = false;
let mousePos = { x: 0, y: 0 };
let gameStartTime = 0;
let particles = [];

// Game Classes
class GameEntity {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // Bounds checking
        this.x = Math.max(this.size || 0, Math.min(CONFIG.WORLD_WIDTH - (this.size || 0), this.x));
        this.y = Math.max(this.size || 0, Math.min(CONFIG.WORLD_HEIGHT - (this.size || 0), this.y));
    }
}

class Player extends GameEntity {
    constructor(x, y, isBot = false, name = 'Player') {
        super(x, y);
        this.level = 1;
        this.score = 0;
        this.isBot = isBot;
        this.name = isBot ? this.generateBotName() : name;
        this.targetX = x;
        this.targetY = y;
        this.lastMoveTime = 0;
        this.health = 100;
        this.maxHealth = 100;
        this.lastDamageTime = 0;
        this.invulnerable = false;
        this.killCount = 0;

        this.updateStats();
    }

    generateBotName() {
        const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Zeta', 'Sigma', 'Theta', 'Prime', 'Neo'];
        const suffixes = ['Beast', 'Hunter', 'Killer', 'Master', 'Lord', 'King', 'Slayer', 'Warrior'];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        return `${prefix}${suffix}${Math.floor(Math.random() * 99) + 1}`;
    }

    updateStats() {
        // Check for level up
        const currentStage = CONFIG.EVOLUTION_STAGES[this.level - 1];
        const nextStage = CONFIG.EVOLUTION_STAGES[this.level];

        if (nextStage && this.score >= nextStage.scoreNeeded) {
            this.evolve();
        }

        this.size = currentStage.size;
        this.color = currentStage.color;
        this.stageName = currentStage.name;
        this.maxHealth = 100 + (this.level - 1) * 25;

        if (this.health > this.maxHealth) {
            this.health = this.maxHealth;
        }
    }

    update() {
        if (this.isBot) {
            this.updateBot();
        } else {
            this.updatePlayer();
        }

        // Update invulnerability
        if (this.invulnerable && Date.now() - this.lastDamageTime > 1000) {
            this.invulnerable = false;
        }

        super.update();
        this.updateStats();
    }

    updatePlayer() {
        const dx = mousePos.x - canvas.width / 2;
        const dy = mousePos.y - canvas.height / 2;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 10) {
            const speed = CONFIG.PLAYER_SPEED;
            this.vx = (dx / distance) * speed;
            this.vy = (dy / distance) * speed;
        } else {
            this.vx *= 0.9;
            this.vy *= 0.9;
        }
    }

    updateBot() {
        const now = Date.now();
        if (now - this.lastMoveTime > 1500 + Math.random() * 1000) {
            let target = this.findTarget();
            if (target) {
                this.targetX = target.x;
                this.targetY = target.y;
            } else {
                // Random movement
                this.targetX = this.x + (Math.random() - 0.5) * 300;
                this.targetY = this.y + (Math.random() - 0.5) * 300;
            }
            this.lastMoveTime = now;
        }

        // Move towards target
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 5) {
            const speed = CONFIG.BOT_SPEED;
            this.vx = (dx / distance) * speed;
            this.vy = (dy / distance) * speed;
        } else {
            this.vx *= 0.8;
            this.vy *= 0.8;
        }
    }

    findTarget() {
        // Prioritize food, avoid stronger enemies, hunt weaker ones
        let bestTarget = null;
        let bestScore = -Infinity;

        // Check food
        food.forEach(f => {
            const distance = Math.sqrt((f.x - this.x) ** 2 + (f.y - this.y) ** 2);
            if (distance < 150) {
                const score = f.value / (distance + 1);
                if (score > bestScore) {
                    bestScore = score;
                    bestTarget = f;
                }
            }
        });

        // Check other players if no food nearby
        if (!bestTarget) {
            const allPlayers = [player, ...bots].filter(p => p !== this && p.health > 0);
            allPlayers.forEach(p => {
                const distance = Math.sqrt((p.x - this.x) ** 2 + (p.y - this.y) ** 2);
                if (distance < 200) {
                    let score = 0;
                    if (this.level > p.level) {
                        // Hunt weaker players
                        score = (p.score + 100) / (distance + 1);
                    } else if (this.level < p.level) {
                        // Avoid stronger players
                        score = -1000 / (distance + 1);
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        bestTarget = p;
                    }
                }
            });
        }

        return bestTarget;
    }

    evolve() {
        if (this.level < CONFIG.EVOLUTION_STAGES.length) {
            this.level++;
            this.health = this.maxHealth; // Full heal on evolution

            if (!this.isBot) {
                this.showEvolutionEffect();
                this.createParticles();
            }
        }
    }

    showEvolutionEffect() {
        const indicator = document.createElement('div');
        indicator.className = 'evolution-indicator';
        indicator.textContent = `EVOLVED TO ${this.stageName}!`;
        document.body.appendChild(indicator);

        setTimeout(() => {
            if (document.body.contains(indicator)) {
                document.body.removeChild(indicator);
            }
        }, 2500);
    }

    createParticles() {
        for (let i = 0; i < 20; i++) {
            particles.push({
                x: this.x + (Math.random() - 0.5) * this.size * 2,
                y: this.y + (Math.random() - 0.5) * this.size * 2,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1,
                decay: 0.02,
                color: this.color,
                size: Math.random() * 5 + 2
            });
        }
    }

    takeDamage(damage, attacker) {
        if (this.invulnerable) return false;

        this.health -= damage;
        this.lastDamageTime = Date.now();
        this.invulnerable = true;

        // Show damage indicator
        this.showDamageIndicator(damage);

        if (this.health <= 0) {
            this.health = 0;
            if (attacker) {
                attacker.killCount++;
                attacker.score += Math.floor(this.score * 0.3);
                this.showScorePopup(attacker, Math.floor(this.score * 0.3));
            }
            return true; // Player died
        }
        return false;
    }

    showDamageIndicator(damage) {
        const indicator = document.createElement('div');
        indicator.className = 'damage-indicator';
        indicator.textContent = `-${damage}`;
        indicator.style.left = (this.x - camera.x) + 'px';
        indicator.style.top = (this.y - camera.y - this.size) + 'px';
        document.body.appendChild(indicator);

        setTimeout(() => {
            if (document.body.contains(indicator)) {
                document.body.removeChild(indicator);
            }
        }, 1000);
    }

    showScorePopup(attacker, points) {
        const popup = document.createElement('div');
        popup.className = 'score-popup';
        popup.textContent = `+${points}`;
        popup.style.left = (attacker.x - camera.x) + 'px';
        popup.style.top = (attacker.y - camera.y - attacker.size - 20) + 'px';
        document.body.appendChild(popup);

        setTimeout(() => {
            if (document.body.contains(popup)) {
                document.body.removeChild(popup);
            }
        }, 1500);
    }

    draw(ctx, offsetX = 0, offsetY = 0) {
        const x = this.x - offsetX;
        const y = this.y - offsetY;

        // Don't draw if off-screen
        if (x < -this.size || x > canvas.width + this.size ||
            y < -this.size || y > canvas.height + this.size) {
            return;
        }

        // Draw glow effect for high level players
        if (this.level >= 5) {
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 15;
        }

        // Draw player circle
        ctx.fillStyle = this.invulnerable ?
            (Date.now() % 200 < 100 ? this.color : 'rgba(255,255,255,0.8)') :
            this.color;
        ctx.beginPath();
        ctx.arc(x, y, this.size, 0, Math.PI * 2);
        ctx.fill();

        // Reset shadow
        ctx.shadowBlur = 0;

        // Draw player border
        ctx.strokeStyle = this.level >= 3 ? '#FFD700' : '#fff';
        ctx.lineWidth = this.level >= 5 ? 3 : 2;
        ctx.stroke();

        // Draw level indicator inside circle
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.max(8, this.size / 3)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(this.level.toString(), x, y + 4);

        // Draw health bar
        if (this.health < this.maxHealth || this.isBot) {
            const barWidth = this.size * 2.2;
            const barHeight = 6;
            const barX = x - barWidth / 2;
            const barY = y - this.size - 15;

            // Background
            ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Health
            ctx.fillStyle = this.health > this.maxHealth * 0.5 ? '#4CAF50' :
                this.health > this.maxHealth * 0.25 ? '#FF9800' : '#F44336';
            ctx.fillRect(barX, barY, (this.health / this.maxHealth) * barWidth, barHeight);

            // Border
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
        }

        // Draw name
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeText(this.name, x, y + this.size + 25);
        ctx.fillText(this.name, x, y + this.size + 25);
    }
}

class Food extends GameEntity {
    constructor(x, y) {
        super(x, y);
        this.size = 4 + Math.random() * 6;
        this.hue = Math.random() * 360;
        this.color = `hsl(${this.hue}, 70%, 60%)`;
        this.value = Math.ceil(this.size / 2);
        this.pulsePhase = Math.random() * Math.PI * 2;
    }

    update() {
        this.pulsePhase += 0.1;
    }

    draw(ctx, offsetX = 0, offsetY = 0) {
        const x = this.x - offsetX;
        const y = this.y - offsetY;

        // Don't draw if off-screen
        if (x < -20 || x > canvas.width + 20 || y < -20 || y > canvas.height + 20) {
            return;
        }

        const pulseSize = this.size + Math.sin(this.pulsePhase) * 2;

        // Glow effect
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(x, y, pulseSize, 0, Math.PI * 2);
        ctx.fill();

        // Inner highlight
        ctx.shadowBlur = 0;
        ctx.fillStyle = `hsl(${this.hue}, 70%, 80%)`;
        ctx.beginPath();
        ctx.arc(x, y, pulseSize * 0.6, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Game Functions
function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    minimapCanvas = document.getElementById('minimap');
    minimapCtx = minimapCanvas.getContext('2d');

    resizeCanvas();
    setupEventListeners();
    setupEvolutionStages();

    // Show start screen
    document.getElementById('startScreen').style.display = 'flex';
}

function setupEventListeners() {
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('mousemove', updateMousePos);
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('respawnBtn').addEventListener('click', respawn);

    // Enter key to start/respawn
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (!gameStarted) {
                startGame();
            } else if (!gameRunning) {
                respawn();
            }
        }
    });
}

function setupEvolutionStages() {
    const stagesList = document.getElementById('stagesList');
    CONFIG.EVOLUTION_STAGES.forEach((stage, index) => {
        const stageDiv = document.createElement('div');
        stageDiv.className = 'stage-item';
        stageDiv.innerHTML = `
            <div class="stage-color" style="background-color: ${stage.color}"></div>
            <span>${stage.name} (${stage.scoreNeeded})</span>
        `;
        stagesList.appendChild(stageDiv);
    });
}

function startGame() {
    const playerName = document.getElementById('playerName').value.trim() || 'Anonymous';

    // Hide start screen
    document.getElementById('startScreen').style.display = 'none';

    // Initialize game
    gameStarted = true;
    gameRunning = true;
    gameStartTime = Date.now();

    // Create player
    player = new Player(CONFIG.WORLD_WIDTH / 2, CONFIG.WORLD_HEIGHT / 2, false, playerName);

    // Create bots
    bots = [];
    for (let i = 0; i < CONFIG.BOT_COUNT; i++) {
        const bot = new Player(
            Math.random() * CONFIG.WORLD_WIDTH,
            Math.random() * CONFIG.WORLD_HEIGHT,
            true
        );
        // Give bots random starting levels for variety
        if (Math.random() < 0.3) {
            bot.level = Math.floor(Math.random() * 3) + 2;
            bot.score = CONFIG.EVOLUTION_STAGES[bot.level - 1].scoreNeeded + Math.random() * 100;
            bot.updateStats();
        }
        bots.push(bot);
    }

    // Generate food
    generateFood();

    // Start game loop
    gameLoop();
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    minimapCanvas.width = 150;
    minimapCanvas.height = 150;
}

function updateMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
}

function generateFood() {
    food = [];
    for (let i = 0; i < CONFIG.FOOD_COUNT; i++) {
        food.push(new Food(
            Math.random() * CONFIG.WORLD_WIDTH,
            Math.random() * CONFIG.WORLD_HEIGHT
        ));
    }
}

function updateParticles() {
    particles = particles.filter(particle => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= particle.decay;
        particle.vx *= 0.98;
        particle.vy *= 0.98;
        return particle.life > 0;
    });
}

function drawParticles() {
    particles.forEach(particle => {
        ctx.save();
        ctx.globalAlpha = particle.life;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x - camera.x, particle.y - camera.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function checkCollisions() {
    if (!player || !gameRunning) return;

    // Player vs Food
    food = food.filter(f => {
        const distance = Math.sqrt((f.x - player.x) ** 2 + (f.y - player.y) ** 2);
        if (distance < player.size + f.size) {
            player.score += f.value;

            // Create eat particle effect
            for (let i = 0; i < 5; i++) {
                particles.push({
                    x: f.x,
                    y: f.y,
                    vx: (Math.random() - 0.5) * 8,
                    vy: (Math.random() - 0.5) * 8,
                    life: 1,
                    decay: 0.03,
                    color: f.color,
                    size: 3
                });
            }

            return false; // Remove food
        }
        return true;
    });

    // Bot vs Food
    bots.forEach(bot => {
        if (bot.health <= 0) return;

        food = food.filter(f => {
            const distance = Math.sqrt((f.x - bot.x) ** 2 + (f.y - bot.y) ** 2);
            if (distance < bot.size + f.size) {
                bot.score += f.value;
                return false;
            }
            return true;
        });
    });

    // Combat system
    const allPlayers = [player, ...bots.filter(b => b.health > 0)];
    for (let i = 0; i < allPlayers.length; i++) {
        for (let j = i + 1; j < allPlayers.length; j++) {
            const p1 = allPlayers[i];
            const p2 = allPlayers[j];

            const distance = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
            if (distance < p1.size + p2.size - 10) {
                // Combat based on level difference
                const levelDiff = p1.level - p2.level;

                if (Math.abs(levelDiff) >= 2) {
                    // Significant level difference
                    const stronger = levelDiff > 0 ? p1 : p2;
                    const weaker = levelDiff > 0 ? p2 : p1;

                    const damage = 15 + Math.abs(levelDiff) * 5;
                    const died = weaker.takeDamage(damage, stronger);

                    if (died) {
                        if (weaker === player) {
                            gameOver();
                            return;
                        } else {
                            // Respawn bot
                            setTimeout(() => respawnBot(weaker), 3000);
                        }
                    }
                } else if (levelDiff !== 0) {
                    // Small level difference - gradual damage
                    const stronger = levelDiff > 0 ? p1 : p2;
                    const weaker = levelDiff > 0 ? p2 : p1;

                    if (Math.random() < 0.1) { // 10% chance per frame
                        const damage = 5;
                        const died = weaker.takeDamage(damage, stronger);

                        if (died) {
                            if (weaker === player) {
                                gameOver();
                                return;
                            } else {
                                setTimeout(() => respawnBot(weaker), 3000);
                            }
                        }
                    }
                }
            }
        }
    }

    // Replenish food
    if (food.length < CONFIG.FOOD_COUNT * 0.6) {
        for (let i = 0; i < 100; i++) {
            food.push(new Food(
                Math.random() * CONFIG.WORLD_WIDTH,
                Math.random() * CONFIG.WORLD_HEIGHT
            ));
        }
    }
}

function respawnBot(bot) {
    if (!gameRunning) return;

    bot.x = Math.random() * CONFIG.WORLD_WIDTH;
    bot.y = Math.random() * CONFIG.WORLD_HEIGHT;
    bot.level = 1;
    bot.score = Math.floor(bot.score * 0.3);
    bot.health = 100;
    bot.maxHealth = 100;
    bot.invulnerable = false;
    bot.killCount = 0;
    bot.updateStats();
}

function updateCamera() {
    if (!player) return;

    // Smooth camera following
    const targetX = player.x - canvas.width / 2;
    const targetY = player.y - canvas.height / 2;

    camera.x += (targetX - camera.x) * 0.1;
    camera.y += (targetY - camera.y) * 0.1;

    // Keep camera within world bounds
    camera.x = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - canvas.height, camera.y));
}

function render() {
    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1e3c72');
    gradient.addColorStop(1, '#2a5298');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid();

    // Draw food (only visible food for performance)
    const visibleFood = food.filter(f =>
        f.x > camera.x - 50 && f.x < camera.x + canvas.width + 50 &&
        f.y > camera.y - 50 && f.y < camera.y + canvas.height + 50
    );
    visibleFood.forEach(f => f.draw(ctx, camera.x, camera.y));

    // Draw bots
    const visibleBots = bots.filter(bot =>
        bot.health > 0 &&
        bot.x > camera.x - 100 && bot.x < camera.x + canvas.width + 100 &&
        bot.y > camera.y - 100 && bot.y < camera.y + canvas.height + 100
    );
    visibleBots.forEach(bot => bot.draw(ctx, camera.x, camera.y));

    // Draw player
    if (player && player.health > 0) {
        player.draw(ctx, camera.x, camera.y);
    }

    // Draw particles
    drawParticles();

    // Draw minimap
    drawMinimap();

    // Draw world border
    drawWorldBorder();
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    const gridSize = 100;
    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;

    for (let x = startX; x < camera.x + canvas.width + gridSize; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x - camera.x, 0);
        ctx.lineTo(x - camera.x, canvas.height);
        ctx.stroke();
    }

    for (let y = startY; y < camera.y + canvas.height + gridSize; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y - camera.y);
        ctx.lineTo(canvas.width, y - camera.y);
        ctx.stroke();
    }
}

function drawWorldBorder() {
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 5;
    ctx.setLineDash([10, 10]);

    // Top border
    if (camera.y <= 0) {
        ctx.beginPath();
        ctx.moveTo(0, -camera.y);
        ctx.lineTo(canvas.width, -camera.y);
        ctx.stroke();
    }

    // Bottom border
    if (camera.y + canvas.height >= CONFIG.WORLD_HEIGHT) {
        ctx.beginPath();
        ctx.moveTo(0, CONFIG.WORLD_HEIGHT - camera.y);
        ctx.lineTo(canvas.width, CONFIG.WORLD_HEIGHT - camera.y);
        ctx.stroke();
    }

    // Left border
    if (camera.x <= 0) {
        ctx.beginPath();
        ctx.moveTo(-camera.x, 0);
        ctx.lineTo(-camera.x, canvas.height);
        ctx.stroke();
    }

    // Right border
    if (camera.x + canvas.width >= CONFIG.WORLD_WIDTH) {
        ctx.beginPath();
        ctx.moveTo(CONFIG.WORLD_WIDTH - camera.x, 0);
        ctx.lineTo(CONFIG.WORLD_WIDTH - camera.x, canvas.height);
        ctx.stroke();
    }

    ctx.setLineDash([]);
}

function drawMinimap() {
    // Clear minimap
    minimapCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    minimapCtx.fillRect(0, 0, 150, 150);

    const scaleX = 150 / CONFIG.WORLD_WIDTH;
    const scaleY = 150 / CONFIG.WORLD_HEIGHT;

    // Draw world border
    minimapCtx.strokeStyle = '#fff';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(0, 0, 150, 150);

    // Draw camera view
    minimapCtx.strokeStyle = '#4CAF50';
    minimapCtx.lineWidth = 2;
    minimapCtx.strokeRect(
        camera.x * scaleX,
        camera.y * scaleY,
        (canvas.width * scaleX),
        (canvas.height * scaleY)
    );

    // Draw player
    if (player && player.health > 0) {
        minimapCtx.fillStyle = '#4CAF50';
        minimapCtx.beginPath();
        minimapCtx.arc(player.x * scaleX, player.y * scaleY, 3, 0, Math.PI * 2);
        minimapCtx.fill();
    }

    // Draw bots
    bots.forEach(bot => {
        if (bot.health > 0) {
            minimapCtx.fillStyle = bot.level > (player ? player.level : 1) ? '#FF0000' : '#FFA500';
            minimapCtx.beginPath();
            minimapCtx.arc(bot.x * scaleX, bot.y * scaleY, 2, 0, Math.PI * 2);
            minimapCtx.fill();
        }
    });
}

function updateUI() {
    if (!player) return;

    document.getElementById('playerLevel').textContent = player.level;
    document.getElementById('playerScore').textContent = player.score;
    document.getElementById('playerHealth').textContent = `${Math.ceil(player.health)}/${player.maxHealth}`;

    const currentStage = CONFIG.EVOLUTION_STAGES[player.level - 1];
    const nextStage = CONFIG.EVOLUTION_STAGES[player.level];

    if (nextStage) {
        const progress = player.score - currentStage.scoreNeeded;
        const needed = nextStage.scoreNeeded - currentStage.scoreNeeded;
        document.getElementById('evolutionProgress').textContent = `${progress}/${needed}`;
    } else {
        document.getElementById('evolutionProgress').textContent = 'MAX LEVEL';
    }

    // Update evolution stages display
    const stageItems = document.querySelectorAll('.stage-item');
    stageItems.forEach((item, index) => {
        item.classList.toggle('current', index === player.level - 1);
    });

    // Update leaderboard
    const allPlayers = [player, ...bots.filter(b => b.health > 0)];
    allPlayers.sort((a, b) => b.score - a.score);

    const leaderboardHTML = allPlayers.slice(0, 10).map((p, i) => {
        const isPlayer = p === player;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        return `<div ${isPlayer ? 'style="font-weight: bold; color: #4CAF50;"' : ''}>
                    ${medal} ${p.name}: ${p.score} ${p.stageName}
                </div>`;
    }).join('');

    document.getElementById('leaderboardList').innerHTML = leaderboardHTML;
}

function gameLoop() {
    if (!gameRunning) return;

    // Update
    if (player && player.health > 0) {
        player.update();
    }

    bots.forEach(bot => {
        if (bot.health > 0) {
            bot.update();
        }
    });

    food.forEach(f => f.update());
    updateParticles();
    checkCollisions();
    updateCamera();

    // Render
    render();
    updateUI();

    requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameRunning = false;
    const timeSurvived = Math.floor((Date.now() - gameStartTime) / 1000);

    document.getElementById('finalScore').textContent = player.score;
    document.getElementById('finalLevel').textContent = player.level;
    document.getElementById('timeSurvived').textContent = timeSurvived;
    document.getElementById('gameOverScreen').style.display = 'flex';
}

function respawn() {
    const playerName = player ? player.name : 'Anonymous';
    player = new Player(CONFIG.WORLD_WIDTH / 2, CONFIG.WORLD_HEIGHT / 2, false, playerName);
    gameRunning = true;
    gameStartTime = Date.now();
    particles = [];

    document.getElementById('gameOverScreen').style.display = 'none';
    gameLoop();
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', init);