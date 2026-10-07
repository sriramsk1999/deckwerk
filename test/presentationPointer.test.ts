// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  eventOnVideo,
  installPresentationPointer,
  POINTER_ACTIVE_CLASS,
  selectionPreventsAdvance,
} from '../src/renderer/player/presentationPointer.js';

describe('presentation pointer navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="copy">Select these words</p>';
    window.getSelection()?.removeAllRanges();
  });

  it('lets an ordinary click advance', () => {
    expect(selectionPreventsAdvance()).toBe(false);
  });

  it('keeps the slide in place after selecting text with the mouse', () => {
    const text = document.getElementById('copy')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 6);
    const selection = window.getSelection()!;
    selection.addRange(range);

    expect(selection.toString()).toBe('Select');
    expect(selectionPreventsAdvance()).toBe(true);
  });

  it('does not suppress navigation for a collapsed caret', () => {
    const text = document.getElementById('copy')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 3);
    range.collapse(true);
    window.getSelection()!.addRange(range);

    expect(selectionPreventsAdvance()).toBe(false);
  });
});

describe('presentation pointer visibility and video controls', () => {
  let uninstall: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="stage"><video id="clip"></video><p id="words">Text</p></div>';
    uninstall = installPresentationPointer(2500);
  });
  afterEach(() => {
    uninstall();
    vi.useRealTimers();
  });

  const fire = (type: string, target: Element, relatedTarget: Element | null = null) => {
    const event = new MouseEvent(type, { bubbles: true, relatedTarget });
    target.dispatchEvent(event);
    return event;
  };
  const active = () => document.documentElement.classList.contains(POINTER_ACTIVE_CLASS);

  it('shows the cursor while the mouse moves and hides it once it rests', () => {
    expect(active()).toBe(false);
    fire('pointermove', document.getElementById('words')!);
    expect(active()).toBe(true);
    vi.advanceTimersByTime(2000);
    fire('pointermove', document.getElementById('words')!);
    vi.advanceTimersByTime(2000);
    expect(active()).toBe(true);
    vi.advanceTimersByTime(600);
    expect(active()).toBe(false);
  });

  it('gives a hovered video its controls and takes them away again', () => {
    const clip = document.getElementById('clip') as HTMLVideoElement;
    expect(clip.controls).toBe(false);
    fire('pointerover', clip);
    expect(clip.controls).toBe(true);
    fire('pointerout', clip, document.getElementById('words'));
    expect(clip.controls).toBe(false);
  });

  it('leaves a video that was authored with controls as it was', () => {
    const clip = document.getElementById('clip') as HTMLVideoElement;
    clip.controls = true;
    fire('pointerover', clip);
    fire('pointerout', clip, document.getElementById('words'));
    expect(clip.controls).toBe(true);
  });

  it('lets a click on a video belong to the video, not to navigation', () => {
    expect(eventOnVideo(fire('click', document.getElementById('clip')!))).toBe(true);
    expect(eventOnVideo(fire('click', document.getElementById('words')!))).toBe(false);
  });
});

