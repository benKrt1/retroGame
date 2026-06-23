// Pacman Game Engine (TypeScript / Canvas)
import { RetroSoundSynth } from './sound-synth';

export type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'VICTORY' | 'DYING';

export interface GameStatus {
  score: number;
  lives: number;
  level: number;
  state: GameState;
  dotsRemaining: number;
}

// Direction representation
export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'NONE';

const DIR_OFFSETS = {
  UP: { x: 0, y: -1, angle: Math.PI * 1.5 },
  DOWN: { x: 0, y: 1, angle: Math.PI * 0.5 },
  LEFT: { x: -1, y: 0, angle: Math.PI },
  RIGHT: { x: 1, y: 0, angle: 0 },
  NONE: { x: 0, y: 0, angle: 0 }
};

const OPPOSITE_DIR: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
  NONE: 'NONE'
};

// 1 = Wall, 2 = Pellet, 3 = Power Pellet, 0 = Empty, 4 = Ghost House, 5 = Gate
const INITIAL_MAZE = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,3,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,3,1],
  [1,2,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,2,1],
  [1,2,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,2,1,1,1,1,1,2,1,2,1,1,2,1],
  [1,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,1],
  [1,1,1,1,2,1,1,1,0,1,0,1,1,1,2,1,1,1,1],
  [0,0,0,1,2,1,0,0,0,0,0,0,0,1,2,1,0,0,0],
  [1,1,1,1,2,1,0,1,1,5,1,1,0,1,2,1,1,1,1],
  [0,0,0,0,2,0,0,1,4,4,4,1,0,0,2,0,0,0,0],
  [1,1,1,1,2,1,0,1,1,1,1,1,0,1,2,1,1,1,1],
  [0,0,0,1,2,1,0,0,0,0,0,0,0,1,2,1,0,0,0],
  [1,1,1,1,2,1,2,1,1,1,1,1,2,1,2,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,2,1],
  [1,3,2,1,2,2,2,2,2,0,2,2,2,2,2,1,2,3,1],
  [1,1,2,1,2,1,2,1,1,1,1,1,2,1,2,1,2,1,1],
  [1,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,1],
  [1,2,1,1,1,1,1,1,2,1,2,1,1,1,1,1,1,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

interface Ghost {
  id: number;
  name: string;
  color: string;
  gridX: number;
  gridY: number;
  x: number;
  y: number;
  dir: Direction;
  targetX: number;
  targetY: number;
  state: 'CHASE' | 'SCATTER' | 'FRIGHTENED' | 'EATEN';
  frightenedFlash: boolean;
  scatterTarget: { x: number; y: number };
}

// --- Visual "juice" entities (rendering only, no gameplay effect) ---
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // ms remaining
  maxLife: number;
  size: number;
  color: string;
}

interface ScorePopup {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
}

export class PacmanEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private synth: RetroSoundSynth;
  private onStatusChange: (status: GameStatus) => void;

  // Maze state
  private maze: number[][] = [];
  private tileWidth = 20;
  private tileHeight = 20;

  // Pacman state
  private pacX = 0;
  private pacY = 0;
  private pacGridX = 9;
  private pacGridY = 16;
  private pacDir: Direction = 'NONE';
  private pacNextDir: Direction = 'NONE';
  private pacSpeed = 2; // Pixels per frame. Must divide tileWidth (20) perfectly.
  private mouthAngle = 0;
  private mouthClosing = false;
  private pacLives = 3;
  private score = 0;
  private level = 1;
  private dotsRemaining = 0;
  private totalDots = 0;

  // Ghosts state
  private ghosts: Ghost[] = [];
  private ghostSpeedNormal = 2;
  private ghostSpeedFrightened = 1;
  private ghostSpeedEaten = 4;
  
  // Game timers / Loop variables
  private animationId: number | null = null;
  private state: GameState = 'START';
  private frightenedTimer = 0;
  private scatterChaseTimer = 0;
  private currentMode: 'CHASE' | 'SCATTER' = 'SCATTER';
  private modeTimeLimit = 7000; // Switch scatter/chase every 7-20 seconds
  private lastTime = 0;
  
  // Scared Ghost Flash Variable
  private flashCycle = 0;

  // Dying animation variables
  private deathFrame = 0;

  // Visual effects (rendering only).
  private particles: Particle[] = [];
  private popups: ScorePopup[] = [];

  constructor(
    canvas: HTMLCanvasElement, 
    synth: RetroSoundSynth,
    onStatusChange: (status: GameStatus) => void
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error("Could not get 2D context");
    this.ctx = context;
    this.synth = synth;
    this.onStatusChange = onStatusChange;

    this.resetGame();
  }

  public resetGame() {
    this.score = 0;
    this.pacLives = 3;
    this.level = 1;
    this.state = 'START';
    this.initLevel();
  }

  private initLevel() {
    // Clone maze layout
    this.maze = INITIAL_MAZE.map(row => [...row]);
    
    // Count dots
    this.totalDots = 0;
    for (let r = 0; r < this.maze.length; r++) {
      for (let c = 0; c < this.maze[r].length; c++) {
        if (this.maze[r][c] === 2 || this.maze[r][c] === 3) {
          this.totalDots++;
        }
      }
    }
    this.dotsRemaining = this.totalDots;

    this.particles = [];
    this.popups = [];

    this.resetPositions();
    this.updateStatus();
  }

  private resetPositions() {
    // Pacman reset
    this.pacGridX = 9;
    this.pacGridY = 16;
    this.pacX = this.pacGridX * this.tileWidth + this.tileWidth / 2;
    this.pacY = this.pacGridY * this.tileHeight + this.tileHeight / 2;
    this.pacDir = 'NONE';
    this.pacNextDir = 'NONE';
    this.mouthAngle = 0;

    // Red (Blinky), Pink (Pinky), Cyan (Inky), Orange (Clyde)
    this.ghosts = [
      {
        id: 0,
        name: 'BLINKY',
        color: '#ff3d00',
        gridX: 9,
        gridY: 8,
        x: 9 * this.tileWidth + this.tileWidth / 2,
        y: 8 * this.tileHeight + this.tileHeight / 2,
        dir: 'UP',
        targetX: 0,
        targetY: 0,
        state: 'SCATTER',
        frightenedFlash: false,
        scatterTarget: { x: 18, y: 0 } // Top-right
      },
      {
        id: 1,
        name: 'PINKY',
        color: '#ff007f',
        gridX: 8,
        gridY: 10,
        x: 8 * this.tileWidth + this.tileWidth / 2,
        y: 10 * this.tileHeight + this.tileHeight / 2,
        dir: 'UP',
        targetX: 0,
        targetY: 0,
        state: 'SCATTER',
        frightenedFlash: false,
        scatterTarget: { x: 0, y: 0 } // Top-left
      },
      {
        id: 2,
        name: 'INKY',
        color: '#00e5ff',
        gridX: 9,
        gridY: 10,
        x: 9 * this.tileWidth + this.tileWidth / 2,
        y: 10 * this.tileHeight + this.tileHeight / 2,
        dir: 'UP',
        targetX: 0,
        targetY: 0,
        state: 'SCATTER',
        frightenedFlash: false,
        scatterTarget: { x: 18, y: 20 } // Bottom-right
      },
      {
        id: 3,
        name: 'CLYDE',
        color: '#ff9100',
        gridX: 10,
        gridY: 10,
        x: 10 * this.tileWidth + this.tileWidth / 2,
        y: 10 * this.tileHeight + this.tileHeight / 2,
        dir: 'UP',
        targetX: 0,
        targetY: 0,
        state: 'SCATTER',
        frightenedFlash: false,
        scatterTarget: { x: 0, y: 20 } // Bottom-left
      }
    ];

    this.currentMode = 'SCATTER';
    this.scatterChaseTimer = 0;
    this.frightenedTimer = 0;
    this.lastTime = performance.now();
  }

  private updateStatus() {
    this.onStatusChange({
      score: this.score,
      lives: this.pacLives,
      level: this.level,
      state: this.state,
      dotsRemaining: this.dotsRemaining
    });
  }

  public setDirection(newDir: Direction) {
    if (this.state === 'PLAYING') {
      // Buffer the next input direction
      this.pacNextDir = newDir;
      // If Pacman is currently stationary, immediately apply direction
      if (this.pacDir === 'NONE') {
        const offset = DIR_OFFSETS[newDir];
        const targetX = this.pacGridX + offset.x;
        const targetY = this.pacGridY + offset.y;
        if (this.isValidMove(targetX, targetY, false)) {
          this.pacDir = newDir;
        }
      }
    }
  }

  public start() {
    if (this.state === 'START' || this.state === 'GAMEOVER' || this.state === 'VICTORY') {
      this.resetGame();
      this.state = 'PLAYING';
      this.synth.stopAll();
      const themeDur = this.synth.playIntroTheme();
      // Wait for theme to finish playing before starting movement, but draw initial state
      this.state = 'START'; // Maintain START during song
      this.updateStatus();
      
      setTimeout(() => {
        if (this.state === 'START') {
          this.state = 'PLAYING';
          this.lastTime = performance.now();
          this.updateStatus();
        }
      }, themeDur || 1500);

      this.gameLoop(performance.now());
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.lastTime = performance.now();
      this.updateStatus();
      this.gameLoop(performance.now());
    }
  }

  public pause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.updateStatus();
      if (this.animationId) cancelAnimationFrame(this.animationId);
    }
  }

  public togglePause() {
    if (this.state === 'PLAYING') {
      this.pause();
    } else if (this.state === 'PAUSED' || this.state === 'START') {
      this.start();
    }
  }

  public destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.synth.stopAll();
  }

  private gameLoop = (timestamp: number) => {
    if (this.state === 'PAUSED') {
      this.drawOverlay("PAUSED");
      return;
    }

    const delta = timestamp - this.lastTime;
    this.lastTime = timestamp;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.state === 'PLAYING') {
      this.updateTimers(delta);
      this.movePacman();
      this.moveGhosts();
      this.checkCollisions();
    } else if (this.state === 'DYING') {
      this.animateDeath();
    }

    this.updateEffects(delta);

    this.drawMaze();
    if (this.state !== 'DYING') {
      this.drawPacman();
    }
    this.drawGhosts();
    this.drawParticles();
    this.drawPopups();

    if (this.state === 'START') {
      this.drawOverlay("READY!");
    }

    this.animationId = requestAnimationFrame(this.gameLoop);
  };

  private updateTimers(delta: number) {
    this.flashCycle = (this.flashCycle + delta) % 400; // Flash cycle for scared ghosts

    if (this.frightenedTimer > 0) {
      this.frightenedTimer -= delta;
      if (this.frightenedTimer <= 0) {
        this.frightenedTimer = 0;
        // Revert frightened ghosts to scatter/chase
        this.ghosts.forEach(ghost => {
          if (ghost.state === 'FRIGHTENED') {
            ghost.state = this.currentMode;
          }
        });
      } else {
        // Flash ghosts white when timer is less than 2.5 seconds remaining
        this.ghosts.forEach(ghost => {
          if (ghost.state === 'FRIGHTENED') {
            ghost.frightenedFlash = this.frightenedTimer < 2500 && Math.floor(this.frightenedTimer / 250) % 2 === 0;
          }
        });
      }
    } else {
      // Manage Scatter vs Chase modes
      this.scatterChaseTimer += delta;
      if (this.scatterChaseTimer >= this.modeTimeLimit) {
        this.scatterChaseTimer = 0;
        this.currentMode = this.currentMode === 'SCATTER' ? 'CHASE' : 'SCATTER';
        this.modeTimeLimit = this.currentMode === 'SCATTER' ? 7000 : 20000; // 7s scatter, 20s chase
        
        this.ghosts.forEach(ghost => {
          if (ghost.state !== 'EATEN') {
            ghost.state = this.currentMode;
            // Force turn back (traditional arcade rules)
            ghost.dir = OPPOSITE_DIR[ghost.dir];
          }
        });
      }
    }
  }

  private isValidMove(gridX: number, gridY: number, isGhost: boolean, ghostGateAllowed = false): boolean {
    // Horizontal wrapping
    if (gridX < 0 || gridX >= this.maze[0].length) {
      return true; // wrapping allowed
    }

    if (gridY < 0 || gridY >= this.maze.length) return false;

    const cell = this.maze[gridY][gridX];
    if (cell === 1) return false; // Wall
    if (cell === 5 && !ghostGateAllowed) return false; // Ghost gate is solid unless entering/exiting

    return true;
  }

  private movePacman() {
    const isAtGridNode = (this.pacX - this.tileWidth / 2) % this.tileWidth === 0 &&
                         (this.pacY - this.tileHeight / 2) % this.tileHeight === 0;

    if (isAtGridNode) {
      // Align grid coordinates
      this.pacGridX = Math.round((this.pacX - this.tileWidth / 2) / this.tileWidth);
      this.pacGridY = Math.round((this.pacY - this.tileHeight / 2) / this.tileHeight);

      // Wrap horizontal tunnels
      if (this.pacGridX < 0) {
        this.pacGridX = this.maze[0].length - 1;
        this.pacX = this.pacGridX * this.tileWidth + this.tileWidth / 2;
      } else if (this.pacGridX >= this.maze[0].length) {
        this.pacGridX = 0;
        this.pacX = this.pacGridX * this.tileWidth + this.tileWidth / 2;
      }

      // Check if next queued direction is valid, and apply it
      if (this.pacNextDir !== 'NONE') {
        const nextOffset = DIR_OFFSETS[this.pacNextDir];
        const nextX = this.pacGridX + nextOffset.x;
        const nextY = this.pacGridY + nextOffset.y;
        if (this.isValidMove(nextX, nextY, false)) {
          this.pacDir = this.pacNextDir;
          this.pacNextDir = 'NONE';
        }
      }

      // Check if current direction is valid to continue
      const offset = DIR_OFFSETS[this.pacDir];
      const targetX = this.pacGridX + offset.x;
      const targetY = this.pacGridY + offset.y;

      if (!this.isValidMove(targetX, targetY, false)) {
        this.pacDir = 'NONE'; // Stop at wall
      }
    }

    // Move pacman position
    const offset = DIR_OFFSETS[this.pacDir];
    this.pacX += offset.x * this.pacSpeed;
    this.pacY += offset.y * this.pacSpeed;

    // Handle eating items
    if (isAtGridNode && this.pacDir !== 'NONE') {
      const cellValue = this.maze[this.pacGridY][this.pacGridX];
      if (cellValue === 2) {
        // Eat Dot
        this.maze[this.pacGridY][this.pacGridX] = 0;
        this.score += 10;
        this.dotsRemaining--;
        this.synth.playWaka();
        this.checkWinCondition();
        this.updateStatus();
      } else if (cellValue === 3) {
        // Eat Power Pellet
        this.maze[this.pacGridY][this.pacGridX] = 0;
        this.score += 50;
        this.dotsRemaining--;
        this.synth.playEatFruit(); // play power sound
        this.spawnBurst(this.pacX, this.pacY, 14, ['#ffeb3b', '#ffffff'], 0.5, 2.2, 240, 520);
        this.frightenedTimer = 7000; // 7 seconds
        
        this.ghosts.forEach(ghost => {
          if (ghost.state !== 'EATEN') {
            ghost.state = 'FRIGHTENED';
            ghost.frightenedFlash = false;
          }
        });

        this.checkWinCondition();
        this.updateStatus();
      }
    }

    // Animate mouth
    if (this.pacDir !== 'NONE') {
      if (this.mouthClosing) {
        this.mouthAngle -= 0.08;
        if (this.mouthAngle <= 0) {
          this.mouthAngle = 0;
          this.mouthClosing = false;
        }
      } else {
        this.mouthAngle += 0.08;
        if (this.mouthAngle >= 0.5) {
          this.mouthAngle = 0.5;
          this.mouthClosing = true;
        }
      }
    } else {
      this.mouthAngle = 0.2; // slightly open when stationary
    }
  }

  private checkWinCondition() {
    if (this.dotsRemaining <= 0) {
      this.state = 'VICTORY';
      this.updateStatus();
      this.synth.playEatFruit();
      setTimeout(() => {
        this.level++;
        this.initLevel();
        this.state = 'START';
        const themeDur = this.synth.playIntroTheme();
        setTimeout(() => {
          if (this.state === 'START') {
            this.state = 'PLAYING';
            this.lastTime = performance.now();
            this.updateStatus();
          }
        }, themeDur || 1500);
      }, 2000);
    }
  }

  private moveGhosts() {
    this.ghosts.forEach(ghost => {
      // Determine speed based on ghost state
      let speed = this.ghostSpeedNormal;
      if (ghost.state === 'FRIGHTENED') speed = this.ghostSpeedFrightened;
      else if (ghost.state === 'EATEN') speed = this.ghostSpeedEaten;

      const isAtGridNode = (ghost.x - this.tileWidth / 2) % this.tileWidth === 0 &&
                           (ghost.y - this.tileHeight / 2) % this.tileHeight === 0;

      if (isAtGridNode) {
        ghost.gridX = Math.round((ghost.x - this.tileWidth / 2) / this.tileWidth);
        ghost.gridY = Math.round((ghost.y - this.tileHeight / 2) / this.tileHeight);

        // Wrap horizontal tunnels
        if (ghost.gridX < 0) {
          ghost.gridX = this.maze[0].length - 1;
          ghost.x = ghost.gridX * this.tileWidth + this.tileWidth / 2;
        } else if (ghost.gridX >= this.maze[0].length) {
          ghost.gridX = 0;
          ghost.x = ghost.gridX * this.tileWidth + this.tileWidth / 2;
        }

        // Check if ghost has returned to ghost house while EATEN
        if (ghost.state === 'EATEN' && ghost.gridX === 9 && ghost.gridY === 10) {
          ghost.state = this.currentMode;
        }

        // Set target coordinate
        this.updateGhostTarget(ghost);

        // Pick next direction at intersection
        ghost.dir = this.getGhostNextDir(ghost);
      }

      // Move ghost
      const offset = DIR_OFFSETS[ghost.dir];
      ghost.x += offset.x * speed;
      ghost.y += offset.y * speed;
    });
  }

  private updateGhostTarget(ghost: Ghost) {
    if (ghost.state === 'EATEN') {
      // Target ghost house entrance (row 9, col 9)
      ghost.targetX = 9;
      ghost.targetY = 9;
      return;
    }

    if (ghost.state === 'FRIGHTENED') {
      // Random targets
      ghost.targetX = Math.floor(Math.random() * 19);
      ghost.targetY = Math.floor(Math.random() * 21);
      return;
    }

    if (ghost.state === 'SCATTER') {
      ghost.targetX = ghost.scatterTarget.x;
      ghost.targetY = ghost.scatterTarget.y;
      return;
    }

    // CHASE state: Different target algorithms per ghost
    switch (ghost.id) {
      case 0: // BLINKY (Red): Chase Pacman directly
        ghost.targetX = this.pacGridX;
        ghost.targetY = this.pacGridY;
        break;

      case 1: // PINKY (Pink): Target 4 cells ahead of Pacman
        const pOffset = DIR_OFFSETS[this.pacDir];
        ghost.targetX = this.pacGridX + pOffset.x * 4;
        ghost.targetY = this.pacGridY + pOffset.y * 4;
        break;

      case 2: // INKY (Cyan): Vector relative to Blinky and Pacman
        // Target Pacman offset plus offset relative to Blinky
        const redGhost = this.ghosts[0];
        const targetCellX = this.pacGridX + DIR_OFFSETS[this.pacDir].x * 2;
        const targetCellY = this.pacGridY + DIR_OFFSETS[this.pacDir].y * 2;
        ghost.targetX = targetCellX + (targetCellX - redGhost.gridX);
        ghost.targetY = targetCellY + (targetCellY - redGhost.gridY);
        break;

      case 3: // CLYDE (Orange): Chases Pacman if far, scatters if near
        const dx = ghost.gridX - this.pacGridX;
        const dy = ghost.gridY - this.pacGridY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 8) {
          ghost.targetX = this.pacGridX;
          ghost.targetY = this.pacGridY;
        } else {
          ghost.targetX = ghost.scatterTarget.x;
          ghost.targetY = ghost.scatterTarget.y;
        }
        break;
    }
  }

  // Pathfinding: Choose best direction to minimize distance to target cell
  // Ghost cannot move backwards (turn 180 degrees) unless forced by state change
  private getGhostNextDir(ghost: Ghost): Direction {
    const possibleDirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    const validMoves: { dir: Direction; dist: number }[] = [];

    const currentOpposite = OPPOSITE_DIR[ghost.dir];

    possibleDirs.forEach(dir => {
      // Cannot move opposite to current travel direction (no turning around)
      if (dir === currentOpposite) return;

      const offset = DIR_OFFSETS[dir];
      const nextX = ghost.gridX + offset.x;
      const nextY = ghost.gridY + offset.y;

      // Allow entering/leaving ghost house via gate (row 9, col 9)
      const isGatePoint = ghost.gridX === 9 && ghost.gridY === 9 && dir === 'DOWN';
      const isExiting = (ghost.gridX === 8 || ghost.gridX === 9 || ghost.gridX === 10) && 
                         ghost.gridY === 10 && dir === 'UP';
      
      const gateAllowed = ghost.state === 'EATEN' ? isGatePoint : isExiting;

      if (this.isValidMove(nextX, nextY, true, gateAllowed)) {
        // Calculate Euclidean distance to target
        const dx = nextX - ghost.targetX;
        const dy = nextY - ghost.targetY;
        const dist = dx * dx + dy * dy;
        validMoves.push({ dir, dist });
      }
    });

    if (validMoves.length === 0) {
      // Fallback in case of dead end (allow turning around)
      return currentOpposite !== 'NONE' ? currentOpposite : 'NONE';
    }

    // Frightened state picks a random valid direction
    if (ghost.state === 'FRIGHTENED') {
      const idx = Math.floor(Math.random() * validMoves.length);
      return validMoves[idx].dir;
    }

    // Sort by distance ascending and pick closest
    validMoves.sort((a, b) => a.dist - b.dist);
    return validMoves[0].dir;
  }

  private checkCollisions() {
    const collisionRadius = 10; // Collision distance threshold in pixels

    for (let i = 0; i < this.ghosts.length; i++) {
      const ghost = this.ghosts[i];
      const dx = this.pacX - ghost.x;
      const dy = this.pacY - ghost.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < collisionRadius) {
        if (ghost.state === 'FRIGHTENED') {
          // Eat Ghost
          ghost.state = 'EATEN';
          this.score += 200;
          this.synth.playEatGhost();
          this.spawnBurst(ghost.x, ghost.y, 16, ['#00e5ff', '#ffffff', '#9be8ff'], 0.6, 2.6, 280, 600);
          this.popups.push({ x: ghost.x, y: ghost.y, text: '+200', life: 800, maxLife: 800 });
          this.updateStatus();
        } else if (ghost.state !== 'EATEN') {
          // Pacman hits an active ghost -> Die!
          this.state = 'DYING';
          this.deathFrame = 0;
          this.synth.playDeath();
          this.spawnBurst(this.pacX, this.pacY, 26, ['#ffeb3b', '#ff9100', '#ffffff'], 1, 3.6, 500, 1100);
          this.updateStatus();
          break;
        }
      }
    }
  }



  // Draw grid layout
  private drawMaze() {
    const rows = this.maze.length;
    const cols = this.maze[0].length;
    const tw = this.tileWidth;
    const th = this.tileHeight;
    const ctx = this.ctx;

    const isWall = (cc: number, rr: number) =>
      rr >= 0 && rr < rows && cc >= 0 && cc < cols && this.maze[rr][cc] === 1;

    // Walls as connected, rounded neon "pipes": dark body pass then bright core.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const passes = [
      { color: '#0a1c66', width: tw * 0.62, glow: 0 },
      { color: '#3d7bff', width: tw * 0.30, glow: 7 },
    ];
    for (const pass of passes) {
      ctx.strokeStyle = pass.color;
      ctx.fillStyle = pass.color;
      ctx.lineWidth = pass.width;
      ctx.shadowColor = 'rgba(61,123,255,0.6)';
      ctx.shadowBlur = pass.glow;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (this.maze[r][c] !== 1) continue;
          const cx = c * tw + tw / 2;
          const cy = r * th + th / 2;
          // Connect to right / down wall neighbours (each shared edge once).
          if (isWall(c + 1, r)) {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + tw, cy);
            ctx.stroke();
          }
          if (isWall(c, r + 1)) {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx, cy + th);
            ctx.stroke();
          }
          // Rounded node so junctions and lone tiles stay solid.
          ctx.beginPath();
          ctx.arc(cx, cy, pass.width / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.shadowBlur = 0;

    // Pellets, power pellets, gate.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = this.maze[r][c];
        const x = c * tw;
        const y = r * th;
        if (val === 2) {
          ctx.fillStyle = '#ffeb3b';
          ctx.shadowColor = 'rgba(255,235,59,0.6)';
          ctx.shadowBlur = 5;
          ctx.beginPath();
          ctx.arc(x + tw / 2, y + th / 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (val === 3) {
          const pr = 6 + Math.sin(performance.now() / 200) * 1.2;
          ctx.fillStyle = '#ffeb3b';
          ctx.shadowColor = 'rgba(255,235,59,0.9)';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(x + tw / 2, y + th / 2, pr, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (val === 5) {
          ctx.fillStyle = '#ff007f';
          ctx.shadowColor = 'rgba(255,0,127,0.6)';
          ctx.shadowBlur = 6;
          ctx.fillRect(x, y + 8, tw, 4);
          ctx.shadowBlur = 0;
        }
      }
    }
  }

  private drawPacman() {
    this.ctx.save();
    this.ctx.translate(this.pacX, this.pacY);

    // Rotate according to current direction
    const offset = DIR_OFFSETS[this.pacDir] || DIR_OFFSETS.RIGHT;
    this.ctx.rotate(offset.angle);

    this.ctx.fillStyle = '#ffeb3b';
    this.ctx.shadowColor = 'rgba(255, 235, 59, 0.4)';
    this.ctx.shadowBlur = 6;
    
    this.ctx.beginPath();
    // Draw mouth arc (Pacman faces right by default in coordinates)
    const mouthSize = this.mouthAngle;
    this.ctx.arc(0, 0, 9, mouthSize, Math.PI * 2 - mouthSize);
    this.ctx.lineTo(0, 0);
    this.ctx.closePath();
    this.ctx.fill();

    // Small eye for character.
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = '#1a1a00';
    this.ctx.beginPath();
    this.ctx.arc(1, -4.5, 1.3, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  private drawGhosts() {
    this.ghosts.forEach(ghost => {
      this.ctx.save();
      this.ctx.translate(ghost.x, ghost.y);

      if (ghost.state === 'EATEN') {
        // Draw eyes only
        this.drawEyes(ghost.dir);
      } else if (ghost.state === 'FRIGHTENED') {
        // Blue scared ghost
        let bodyColor = '#0022aa';
        let faceColor = '#ffeb3b';

        if (ghost.frightenedFlash) {
          bodyColor = '#ffffff';
          faceColor = '#ff3d00';
        }

        this.drawGhostBody(bodyColor);
        this.drawScaredFace(faceColor);
      } else {
        // Draw normal ghost
        this.drawGhostBody(ghost.color);
        this.drawEyes(ghost.dir);
      }

      this.ctx.restore();
    });
  }

  private drawGhostBody(color: string) {
    this.ctx.fillStyle = color;
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = 5;

    this.ctx.beginPath();
    // Round top dome
    this.ctx.arc(0, -2, 9, Math.PI, 0, false);
    // Right side
    this.ctx.lineTo(9, 9);
    
    // Squiggly animated bottom (sine wave style)
    const timeFactor = Math.floor(performance.now() / 150) % 2;
    if (timeFactor === 0) {
      this.ctx.lineTo(6, 6);
      this.ctx.lineTo(3, 9);
      this.ctx.lineTo(0, 6);
      this.ctx.lineTo(-3, 9);
      this.ctx.lineTo(-6, 6);
    } else {
      this.ctx.lineTo(6, 9);
      this.ctx.lineTo(3, 6);
      this.ctx.lineTo(0, 9);
      this.ctx.lineTo(-3, 6);
      this.ctx.lineTo(-6, 9);
    }
    
    // Left side
    this.ctx.lineTo(-9, 9);
    this.ctx.closePath();
    this.ctx.fill();

    // Glossy highlight on the upper-left of the dome.
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = 'rgba(255,255,255,0.22)';
    this.ctx.beginPath();
    this.ctx.ellipse(-3.5, -4, 3, 4.5, -0.4, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawEyes(dir: Direction) {
    // Pupils coordinate offset based on look direction
    let dx = 0;
    let dy = 0;
    if (dir === 'UP') dy = -2;
    else if (dir === 'DOWN') dy = 2;
    else if (dir === 'LEFT') dx = -2;
    else if (dir === 'RIGHT') dx = 2;

    // Draw Left Eye
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(-4, -2, 3, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#0055ff';
    this.ctx.beginPath();
    this.ctx.arc(-4 + dx, -2 + dy, 1.5, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw Right Eye
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(4, -2, 3, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#0055ff';
    this.ctx.beginPath();
    this.ctx.arc(4 + dx, -2 + dy, 1.5, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawScaredFace(color: string) {
    this.ctx.fillStyle = color;
    
    // Eyes (small squares)
    this.ctx.fillRect(-4, -4, 2, 2);
    this.ctx.fillRect(2, -4, 2, 2);
    
    // Mouth (wiggly line)
    this.ctx.fillRect(-5, 3, 1, 1);
    this.ctx.fillRect(-4, 2, 2, 1);
    this.ctx.fillRect(-2, 3, 2, 1);
    this.ctx.fillRect(0, 2, 2, 1);
    this.ctx.fillRect(2, 3, 2, 1);
    this.ctx.fillRect(4, 2, 1, 1);
  }

  // Draw melting Pacman during death state
  private drawPacmanDeathAnimation() {
    this.ctx.save();
    this.ctx.translate(this.pacX, this.pacY);

    const deathRatio = this.deathFrame / 60; // 0 to 1
    const angle = deathRatio * Math.PI;

    this.ctx.fillStyle = '#ffeb3b';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 9, angle, Math.PI * 2 - angle);
    this.ctx.lineTo(0, 0);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  private animateDeath() {
    this.deathFrame += 1;

    // Draw Pacman eating itself (mouth expanding until complete circle gone)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawMaze();
    this.drawPacmanDeathAnimation();

    if (this.deathFrame > 60) {
      this.pacLives--;
      this.updateStatus();

      if (this.pacLives <= 0) {
        this.state = 'GAMEOVER';
      } else {
        this.resetPositions();
        this.state = 'START';
        
        setTimeout(() => {
          if (this.state === 'START') {
            this.state = 'PLAYING';
            this.lastTime = performance.now();
            this.updateStatus();
          }
        }, 1500);
      }
      this.updateStatus();
    }
  }

  // ---- Visual effects (rendering only) ----

  private spawnBurst(
    x: number, y: number, count: number,
    palette: string[], speedMin: number, speedMax: number,
    lifeMin: number, lifeMax: number
  ) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = speedMin + Math.random() * (speedMax - speedMin);
      const life = lifeMin + Math.random() * (lifeMax - lifeMin);
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life, maxLife: life,
        size: 1 + Math.random() * 1.8,
        color: palette[Math.floor(Math.random() * palette.length)],
      });
    }
  }

  private updateEffects(delta: number) {
    const f = delta / 16.67;
    for (const p of this.particles) {
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.vx *= Math.pow(0.97, f);
      p.vy *= Math.pow(0.97, f);
      p.life -= delta;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const s of this.popups) {
      s.y -= 0.4 * f;
      s.life -= delta;
    }
    this.popups = this.popups.filter((s) => s.life > 0);
  }

  private drawParticles() {
    for (const p of this.particles) {
      this.ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      this.ctx.fillStyle = p.color;
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 4;
      this.ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
  }

  private drawPopups() {
    this.ctx.font = '8px "Press Start 2P", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.shadowColor = 'rgba(0, 229, 255, 0.6)';
    this.ctx.shadowBlur = 6;
    for (const s of this.popups) {
      this.ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
      this.ctx.fillStyle = '#00e5ff';
      this.ctx.fillText(s.text, s.x, s.y);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
  }

  private drawOverlay(text: string) {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = '#ffeb3b';
    this.ctx.font = '16px "Press Start 2P", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    // Retro font shadow
    this.ctx.shadowColor = 'rgba(255, 235, 59, 0.4)';
    this.ctx.shadowBlur = 8;

    this.ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2);
    
    this.ctx.shadowBlur = 0; // reset
  }
}
export default PacmanEngine;
