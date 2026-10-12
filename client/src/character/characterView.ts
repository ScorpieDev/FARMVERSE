/**
 * Character screen helpers (Phase 4, decisions K-A coin shop, D-A screen).
 * Pure functions.
 *
 * The client keeps only a UI draft: the open tab and the look being tried on.
 * Tapping an owned or buyable item tries it on locally; Buy asks the server to
 * sell the item tried on in the open tab, Wear asks the server to save the
 * whole draft. Prices, levels, coins and ownership are decided by the server;
 * what is shown here from the shared catalog is only a hint, and the farm is
 * always drawn from the server's FarmState.
 */
import type { FarmState } from "@farmverse/shared/api";
import {
  COSMETICS,
  SKIN_TONES,
  getCosmetic,
  isSkinTone,
  type CharacterAppearance,
  type CosmeticId,
  type CosmeticSlot,
  type SkinTone,
} from "@farmverse/shared/character";
import type { ErrorCode } from "@farmverse/shared/errors";

export const CHARACTER_TABS = ["hair", "shirt", "pants", "skin"] as const;
export type CharacterTab = (typeof CHARACTER_TABS)[number];

/** One choice in a tab: a cosmetic, or a skin tone in the Skin tab. */
export type CharacterOption = CosmeticId | SkinTone;

export interface CharacterDraft {
  tab: CharacterTab;
  /** The look being tried on; saved only by Wear. */
  appearance: CharacterAppearance;
}

/** What a tap on the Character screen asks for. */
export type CharacterIntent =
  | { kind: "select"; draft: CharacterDraft }
  | { kind: "buy"; cosmeticId: CosmeticId }
  | { kind: "equip"; appearance: CharacterAppearance }
  | { kind: "message"; text: string };

const TAB_NAMES: Record<CharacterTab, string> = { hair: "Hair", shirt: "Shirt", pants: "Pants", skin: "Skin" };
const SKIN_NAMES: Record<SkinTone, string> = { light: "Light", tan: "Tan", brown: "Brown", dark: "Dark" };

export function tabName(tab: CharacterTab): string {
  return TAB_NAMES[tab];
}

/** Opening the screen: the Hair tab and the look the server says is worn. */
export function startDraft(state: FarmState): CharacterDraft {
  return { tab: "hair", appearance: { ...state.character.appearance } };
}

/** Options of a tab, in catalog order. */
export function tabOptions(tab: CharacterTab): CharacterOption[] {
  if (tab === "skin") return [...SKIN_TONES];
  return COSMETICS.filter((item) => item.slot === tab).map((item) => item.id);
}

export function isOwned(state: FarmState, cosmeticId: CosmeticId): boolean {
  return state.character.owned.includes(cosmeticId);
}

/** True when the player's level is below the item's unlock level (owned items are never locked). */
export function isCosmeticLocked(state: FarmState, cosmeticId: CosmeticId): boolean {
  return !isOwned(state, cosmeticId) && state.progression.level < getCosmetic(cosmeticId).unlockLevel;
}

export function optionName(option: CharacterOption): string {
  return isSkinTone(option) ? SKIN_NAMES[option] : getCosmetic(option).name;
}

/** The option of `tab` the draft is trying on. */
export function draftOption(draft: CharacterDraft): CharacterOption {
  return draft.appearance[draft.tab];
}

/** Label of an option button: name, then Owned / price / unlock level. */
export function optionLabel(state: FarmState, option: CharacterOption): string {
  const name = optionName(option);
  if (isSkinTone(option)) return `${name}\nFree`;
  if (isOwned(state, option)) return `${name}\nOwned`;
  const { price, unlockLevel } = getCosmetic(option);
  return isCosmeticLocked(state, option) ? `${name}\nLevel ${unlockLevel}` : `${name}\n${price}c`;
}

/** Switching tabs keeps the draft. */
export function tapTab(draft: CharacterDraft, tab: CharacterTab): CharacterIntent {
  return { kind: "select", draft: { ...draft, tab } };
}

/** Tapping an option tries it on; locked items only show their level. */
export function tapOption(state: FarmState, draft: CharacterDraft, option: CharacterOption): CharacterIntent {
  if (isSkinTone(option)) {
    return { kind: "select", draft: { ...draft, appearance: { ...draft.appearance, skin: option } } };
  }
  const { name, slot, unlockLevel } = getCosmetic(option);
  if (isCosmeticLocked(state, option)) return { kind: "message", text: `${name} unlocks at level ${unlockLevel}.` };
  return { kind: "select", draft: { tab: slot, appearance: { ...draft.appearance, [slot]: option } } };
}

/** Buy button: asks the server to sell the item tried on in the open tab. */
export function tapBuy(state: FarmState, draft: CharacterDraft): CharacterIntent {
  if (draft.tab === "skin") return { kind: "message", text: "Skin tones are free. Tap Wear to keep it." };
  const cosmeticId = draft.appearance[draft.tab];
  if (isOwned(state, cosmeticId)) return { kind: "message", text: `You already own ${getCosmetic(cosmeticId).name}.` };
  return { kind: "buy", cosmeticId };
}

/** Items of the draft the player does not own yet, in slot order. */
export function unownedInDraft(state: FarmState, draft: CharacterDraft): CosmeticId[] {
  const slots: CosmeticSlot[] = ["hair", "shirt", "pants"];
  return slots.map((slot) => draft.appearance[slot]).filter((id) => !isOwned(state, id));
}

function sameAppearance(a: CharacterAppearance, b: CharacterAppearance): boolean {
  return a.skin === b.skin && a.hair === b.hair && a.shirt === b.shirt && a.pants === b.pants;
}

/** Wear button: asks the server to save the draft when every item is owned. */
export function tapWear(state: FarmState, draft: CharacterDraft): CharacterIntent {
  const missing = unownedInDraft(state, draft);
  if (missing.length > 0) return { kind: "message", text: `Buy ${getCosmetic(missing[0]!).name} first.` };
  if (sameAppearance(draft.appearance, state.character.appearance)) {
    return { kind: "message", text: "You are already wearing this look." };
  }
  return { kind: "equip", appearance: { ...draft.appearance } };
}

/** Status line under the preview, starting with the coin balance. */
export function draftText(state: FarmState, draft: CharacterDraft): string {
  return `Coins ${state.coins} · ${draftHint(state, draft)}`;
}

function draftHint(state: FarmState, draft: CharacterDraft): string {
  const option = draftOption(draft);
  if (!isSkinTone(option) && !isOwned(state, option)) {
    return `${optionName(option)}: ${getCosmetic(option).price} coins · tap Buy`;
  }
  if (unownedInDraft(state, draft).length > 0) return "Buy the items you are trying on to wear them.";
  if (sameAppearance(draft.appearance, state.character.appearance)) return "This is your look.";
  return "Tap Wear to keep this look.";
}

/** Hint colour for the Buy button: an unowned, unlocked, affordable item is tried on (the server decides). */
export function canBuy(state: FarmState, draft: CharacterDraft): boolean {
  const option = draftOption(draft);
  return (
    !isSkinTone(option) &&
    !isOwned(state, option) &&
    !isCosmeticLocked(state, option) &&
    state.coins >= getCosmetic(option).price
  );
}

/** Hint colour for the Wear button. */
export function canWear(state: FarmState, draft: CharacterDraft): boolean {
  return tapWear(state, draft).kind === "equip";
}

export function buyCosmeticText(bought: { cosmeticId: CosmeticId; price: number }): string {
  return `Bought ${getCosmetic(bought.cosmeticId).name} for ${bought.price} coins. Tap Wear to put it on.`;
}

export const WEAR_SUCCESS_TEXT = "New look saved.";

const CHARACTER_ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  ALREADY_OWNED: "You already own that. Farm refreshed.",
  ITEM_NOT_OWNED: "Buy that item before wearing it.",
  INSUFFICIENT_CURRENCY: "Not enough coins for that. Harvest crops to earn more.",
  LEVEL_TOO_LOW: "Reach a higher level to buy that.",
};

/** Error text for a rejected purchase or equip, or undefined to use the general farm error text. */
export function characterErrorText(code: ErrorCode): string | undefined {
  return CHARACTER_ERROR_TEXT[code];
}
