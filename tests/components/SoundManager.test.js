// Mock AudioContext before importing
const mockGainNode = {
  gain: {
    value: 0.3,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
  connect: vi.fn(),
};

const mockOscillator = {
  type: '',
  frequency: {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  },
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

const mockBufferSource = {
  buffer: null,
  connect: vi.fn(),
  start: vi.fn(),
};

const mockAudioContext = {
  createGain: vi.fn(() => mockGainNode),
  createOscillator: vi.fn(() => ({ ...mockOscillator })),
  createBufferSource: vi.fn(() => ({ ...mockBufferSource })),
  decodeAudioData: vi.fn().mockResolvedValue('decoded-buffer'),
  destination: {},
  currentTime: 0,
  state: 'running',
  resume: vi.fn(),
};

// Use a real class so `new AudioContext()` works
class MockAudioContextClass {
  constructor() {
    Object.assign(this, mockAudioContext);
  }
}
global.AudioContext = MockAudioContextClass;
global.window = global.window || {};
global.window.AudioContext = MockAudioContextClass;
global.window.webkitAudioContext = MockAudioContextClass;

// Mock Audio constructor
const mockAudioElement = {
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  currentTime: 0,
  volume: 1,
  loop: false,
};
// Use a class so `new Audio()` works
class MockAudioClass {
  constructor(src) {
    this.src = src;
    this.play = vi.fn().mockResolvedValue(undefined);
    this.pause = vi.fn();
    this.currentTime = 0;
    this.volume = 1;
    this.loop = false;
  }
}
global.Audio = MockAudioClass;

// Mock fetch for loadBuffer
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
});

// We can't import the class directly since it's not exported.
// Instead, test via the singleton and prototype.
import { soundManager } from '@/lib/game/SoundManager';

describe('SoundManager (via singleton)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton state for each test
    soundManager.initialized = false;
    soundManager.ctx = null;
    soundManager.masterGain = null;
    soundManager.buffers = {};
    soundManager.bgm = null;
    soundManager.bgmNode = null;
  });

  it('singleton exists with default state after reset', () => {
    expect(soundManager).toBeDefined();
    expect(soundManager.initialized).toBe(false);
    expect(soundManager.ctx).toBeNull();
    expect(soundManager.bgm).toBeNull();
  });

  it('init creates AudioContext and master gain', () => {
    soundManager.init();
    expect(soundManager.initialized).toBe(true);
    expect(soundManager.ctx).toBeTruthy();
    expect(soundManager.ctx.createGain).toHaveBeenCalled();
  });

  it('init only initializes once', () => {
    soundManager.init();
    const ctx1 = soundManager.ctx;
    soundManager.init();
    expect(soundManager.ctx).toBe(ctx1);
  });

  it('play method initializes and creates synth sounds', () => {
    soundManager.play('shoot');
    expect(soundManager.initialized).toBe(true);
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
  });

  it('play uses buffer when available', () => {
    soundManager.init();
    soundManager.buffers['se_hit'] = 'test-buffer';
    soundManager.play('hit');
    expect(soundManager.ctx.createBufferSource).toHaveBeenCalled();
  });

  it('playBGM creates and plays Audio element', () => {
    soundManager.playBGM();
    expect(soundManager.bgm).toBeTruthy();
    expect(soundManager.bgm.src).toBe('/audio/bgm_main.mp3');
    expect(soundManager.bgm.play).toHaveBeenCalled();
    expect(soundManager.bgm.loop).toBe(true);
  });

  it('stopBGM pauses and resets audio', () => {
    soundManager.playBGM();
    const bgm = soundManager.bgm;
    soundManager.stopBGM();
    expect(bgm.pause).toHaveBeenCalled();
    expect(bgm.currentTime).toBe(0);
  });

  it('resumes context if suspended', () => {
    soundManager.init();
    soundManager.ctx.state = 'suspended';
    soundManager.play('shoot');
    expect(soundManager.ctx.resume).toHaveBeenCalled();
    soundManager.ctx.state = 'running';
  });

  it('synth handles different sound keys without throwing', () => {
    soundManager.init();
    ['shoot', 'hit', 'powerup', 'damage', 'gameover'].forEach(key => {
      expect(() => soundManager.synth(key)).not.toThrow();
    });
  });

  it('loadBuffer fetches and decodes audio', async () => {
    soundManager.init();
    await soundManager.loadBuffer('se_test', '/audio/test.mp3');
    expect(global.fetch).toHaveBeenCalledWith('/audio/test.mp3');
    expect(soundManager.ctx.decodeAudioData).toHaveBeenCalled();
    expect(soundManager.buffers['se_test']).toBe('decoded-buffer');
  });
});
