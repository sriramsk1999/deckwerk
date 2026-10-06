/**
 * The face of the editor chrome's own words: the monospace it was designed
 * with, or the operating system's interface font. Slides keep their deck's
 * fonts either way, and what must line up (timecodes, colour values, slide
 * numbers) stays monospace through `--mono`. Like the light/dark choice
 * (uiTheme.ts) it is per machine, kept in localStorage, and set on <html>
 * before first paint.
 */
export type UiFont = 'mono' | 'system';

const KEY = 'deckwerk.uiFont';

export function storedUiFont(): UiFont {
  try {
    return localStorage.getItem(KEY) === 'system' ? 'system' : 'mono';
  } catch {
    return 'mono';
  }
}

let following = false;

/** Paint the stored choice onto <html>, and follow a choice made in another window. */
export function applyUiFont(): UiFont {
  const font = storedUiFont();
  if (font === 'system') document.documentElement.dataset.uiFont = font;
  else delete document.documentElement.dataset.uiFont;
  if (!following) {
    following = true;
    window.addEventListener('storage', (event) => {
      if (event.key === KEY) applyUiFont();
    });
  }
  return font;
}

export function setUiFont(font: UiFont): UiFont {
  try {
    if (font === 'mono') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, font);
  } catch {
    // A locked-down profile still gets the font for this window.
  }
  return applyUiFont();
}

/** The Interface font section of the DeckWerk menu. */
export function interfaceFontMenuSection(): {
  label: string;
  options: { label: string; action: () => void; checked: () => boolean }[];
} {
  const option = (label: string, font: UiFont) => ({
    label,
    action: () => { setUiFont(font); },
    checked: () => storedUiFont() === font,
  });
  return {
    label: 'Interface font',
    options: [option('Monospace', 'mono'), option('System font', 'system')],
  };
}
