/** One node of an Android accessibility tree, as the Appium source normalizer builds it from UiAutomator2 XML. */
export interface AndroidNode {
  class?: string;
  text?: string;
  hint?: string;
  'content-desc'?: string;
  'resource-id'?: string;
  checkable?: boolean;
  checked?: boolean;
  clickable?: boolean;
  enabled?: boolean;
  focused?: boolean;
  selected?: boolean;
  visible?: boolean;
  scrollable?: boolean;
  password?: boolean;
  rect?: { x: number; y: number; width: number; height: number };
  children?: AndroidNode[] | null;
}

/** A system bar node's resource-id prefix: the settle rule leaves it out, and the mapping drops it. */
export const STATUS_BAR_ID_PREFIX = 'com.android.systemui:';

/** One capture of the tree: the settle rule compares it and the mapping reads it. */
export interface AndroidTree { hierarchy: AndroidNode[] }
