// Explicit bindings preserve Node's named dynamic imports through Playwright's CJS transform.
// All behavior remains in the one browser-safe implementation.
import * as model from '../../src/editor/model';
export const isDynamic = model.isDynamic;
export const presets = model.presets;
export const freshDocument = model.freshDocument;
export const shapes = model.shapes;
export const localBounds = model.localBounds;
export const objectBounds = model.objectBounds;
export const hasCircle = model.hasCircle;
export const editablePolygon = model.editablePolygon;
export const objectContains = model.objectContains;
export const edit = model.edit;
export const item = model.item;
export const mutableItem = model.mutableItem;
export const uniqueId = model.uniqueId;
export const place = model.place;
export const move = model.move;
export const objectPolygons = model.objectPolygons;
export const remove = model.remove;
export const copyObject = model.copyObject;
export const pasteObject = model.pasteObject;
export const duplicate = model.duplicate;
export const scaleObject = model.scaleObject;
export const setOutline = model.setOutline;
export const historyCommit = model.historyCommit;
export const historyUndo = model.historyUndo;
export const historyRedo = model.historyRedo;
export const sameSelection = model.sameSelection;
export const toggleSelection = model.toggleSelection;
export const selectableObjects = model.selectableObjects;
export const regionSelection = model.regionSelection;
export const moveObjects = model.moveObjects;
export const removeObjects = model.removeObjects;
export const copyObjects = model.copyObjects;
export const pasteObjects = model.pasteObjects;
export type {
  Kind,
  Selection,
  Mutable,
  DraftDocument,
  Item,
  Preset,
  CopiedObject,
  History,
} from '../../src/editor/model';
