import type { Element } from '../../contracts/index.js';
import type { Role } from '../../scripted/vocabulary.js';
import { STATUS_BAR_ID_PREFIX, type AndroidNode, type AndroidTree } from './agent-client.js';

const TEXT_FIELD_CLASS = /EditText$|AutoCompleteTextView$/;
const SCROLL_CLASS = /(RecyclerView|ListView|ScrollView|GridView|ViewPager2?|NestedScrollView)$/;
/** What a password field shows in place of each character of its text. */
const PASSWORD_DOT = '•';

const childrenOf = (node: AndroidNode): AndroidNode[] => node.children ?? [];

/** A node's own label text, trimmed. A password field's text is never used, only its content-desc. */
const ownText = (node: AndroidNode): string =>
  (node['content-desc'] || (node.password ? '' : node.text) || '').trim();

/**
 * Compose reports a node's role as an extra child: textless, not clickable, with the role's class
 * (a Button's clickable View has an empty android.widget.Button child). It is a marker, not an element.
 */
const ROLE_MARKER = /\.(Button|CheckBox|RadioButton|Switch|Tab|ImageButton|ToggleButton)$/;
const isRoleMarker = (child: AndroidNode, parent: AndroidNode): boolean => Boolean(parent.clickable) &&
  !child.clickable && !ownText(child) && childrenOf(child).length === 0 && ROLE_MARKER.test(child.class ?? '');
const roleMarker = (node: AndroidNode): AndroidNode | undefined => childrenOf(node).find(child => isRoleMarker(child, node));

/**
 * The bridge role, from the class or the Compose role marker. The text-field rule comes first, so a
 * multi-line `EditText` that reports `scrollable` keeps `typeText`; then any scrollable node is a scroll view.
 * CheckBox and RadioButton are switches: no new 1.x roles.
 */
function roleOf(node: AndroidNode): Role {
  const cls = roleMarker(node)?.class || node.class || '';
  if (TEXT_FIELD_CLASS.test(cls)) return 'text-field';
  if (node.scrollable) return 'scroll-view';
  if (/CheckBox$|RadioButton$|Switch$|SwitchCompat$|SwitchMaterial$|ToggleButton$/.test(cls) || node.checkable) return 'switch';
  if (/SeekBar$|Slider$/.test(cls)) return 'slider';
  if (SCROLL_CLASS.test(cls)) return 'scroll-view';
  if (/Button$/.test(cls) || node.clickable) return 'button';
  if (/TextView$/.test(cls)) return 'text';
  if (/ImageView$/.test(cls)) return 'image';
  return 'other';
}

/** Text descendants a blank button's label may come from, stopping at nested actionable nodes and fields. */
function liftSources(node: AndroidNode): AndroidNode[] {
  const found: AndroidNode[] = [];
  const walk = (child: AndroidNode): void => {
    if (child.clickable || child.checkable || child.password || TEXT_FIELD_CLASS.test(child.class ?? '')) return;
    if (ownText(child)) found.push(child);
    childrenOf(child).forEach(walk);
  };
  childrenOf(node).forEach(walk);
  return found;
}

/**
 * Maps one capture of the device agent's tree to the bridge's elements, by the rules the owner settled over
 * the prototype (`spikes/android/element-mapping.cjs` at 2366759, with its default options): system bars,
 * invisible and zero-size nodes, Compose role markers and layout wrappers are dropped; a blank button takes
 * its first inner text as its label, and that text stays for Jev but can't be selected; IDs are full
 * resource-ids; switches are "1"/"0". A text field's text is kept exactly as the device reports it, and a
 * password field shows dots of its length. Each element's ref is stable within this capture only.
 */
export function mapAndroidTree(tree: AndroidTree): Element[] {
  const elements: { element: Element; node: AndroidNode }[] = [];
  const lifted = new Set<AndroidNode>();
  const placeholders = new Set<AndroidNode>();
  let ref = 0;
  const visit = (node: AndroidNode, parent?: AndroidNode): void => {
    const id = node['resource-id'] || '';
    if (id.startsWith(STATUS_BAR_ID_PREFIX)) return;
    if (parent && isRoleMarker(node, parent)) return;
    if (node.visible === false) return;
    if (!node.rect || node.rect.width <= 0 || node.rect.height <= 0) return;
    const role = roleOf(node);
    const element: Element = { ref: `e${++ref}`, role, actions: [] };
    let label = ownText(node);
    if (role === 'text-field') {
      const text = node.text ?? '';
      label = (node['content-desc'] || '').trim();
      if (text !== '') element.value = node.password ? PASSWORD_DOT.repeat(text.length) : text;
      if (!label) {
        const hint = (node.hint || '').trim();
        const drawn = hint ? undefined : liftSources(node)[0];
        const placeholder = hint || (drawn ? ownText(drawn) : '');
        if (placeholder) label = placeholder;
        // Jev sees an empty field's grey hint as a placeholder, never as a label or a text line inside the field.
        if (placeholder && text === '') element.placeholder = placeholder;
        if (drawn) placeholders.add(drawn);
      }
    } else if (!label && (node.clickable || node.checkable)) {
      const first = liftSources(node)[0];
      if (first) {
        label = ownText(first);
        lifted.add(first);
      }
    }
    if (label) element.label = label;
    if (role === 'switch') element.value = node.checked ? '1' : '0';
    if (id) element.identifier = id;
    element.frame = { x: node.rect.x, y: node.rect.y, width: node.rect.width, height: node.rect.height };
    element.state = { enabled: node.enabled !== false, visible: true,
      ...(node.focused ? { focused: true } : {}), ...(node.selected ? { selected: true } : {}) };
    if (node.clickable || role === 'switch' || role === 'text-field') element.actions.push('tap');
    if (role === 'text-field') element.actions.push('typeText');
    if (role === 'scroll-view') element.actions.push('swipeWithin');
    elements.push({ element, node });
    childrenOf(node).forEach(child => visit(child, node));
  };
  tree.hierarchy.forEach(node => visit(node));
  return elements.flatMap(({ element, node }) => {
    if (placeholders.has(node)) return [];
    // A lifted text stays for Jev but is not selectable: its button already carries it as the label.
    if (lifted.has(node)) element.selectable = false;
    const wrapper = element.role === 'other' && !element.label && !element.value && element.actions.length === 0;
    return wrapper ? [] : [element];
  });
}
