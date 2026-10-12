'use client';
import { useEffect, useState } from 'react';
import {
  forceDefinition,
  polygonBounds,
  rectangle,
  shapeOutline,
  shapePolygon,
} from '../../src/game';
import type { LevelDocument, Vec2, FieldParam } from '../../src/game';
import {
  edit,
  isDynamic,
  item,
  mutableItem,
  scaleObject,
  setOutline,
  shapes,
  localBounds,
  hasCircle,
  editablePolygon,
} from '../editor/model';
import type { DraftDocument, Item, Selection } from '../editor/model';

export function NumberInput({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(Number(value.toFixed(5)))), [value]);
  return (
    <label className="property">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={() => {
          if (text.trim() && Number.isFinite(Number(text))) onChange(Number(text));
          setText(String(Number(value.toFixed(5))));
        }}
      />
    </label>
  );
}
function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="property">
      <span>{label}</span>
      <input
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={() => {
          onChange(text);
          setText(value);
        }}
      />
    </label>
  );
}
export function VectorInputs({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Vec2;
  onChange: (v: Vec2) => void;
}) {
  return (
    <div className="property-pair">
      <NumberInput
        label={`${label} X`}
        value={value.x}
        onChange={(x) => onChange({ ...value, x })}
      />
      <NumberInput
        label={`${label} Y`}
        value={value.y}
        onChange={(y) => onChange({ ...value, y })}
      />
    </div>
  );
}
type Props = {
  document: LevelDocument;
  selection: Selection | null;
  piece: number;
  setPiece: (i: number) => void;
  vertices: boolean;
  setVertices: (v: boolean) => void;
  apply: (fn: (d: LevelDocument) => LevelDocument) => void;
  onRename: (id: string) => void;
};
export function Inspector({
  document: doc,
  selection,
  apply,
  piece,
  setPiece,
  vertices,
  setVertices,
  onRename,
}: Props) {
  const [outline, setOutlineText] = useState('');
  useEffect(() => setOutlineText(''), [selection?.id]);
  const modify = (fn: (draft: DraftDocument) => void) => apply((d) => edit(d, fn));
  const object = selection ? item(doc, selection) : undefined;
  const change = (fn: (object: Item) => void) => modify((d) => fn(mutableItem(d, selection!)));
  if (!selection)
    return (
      <section className="inspector-content">
        <h2>Course properties</h2>
        <TextInput
          label="Level ID / filename"
          value={doc.level.id}
          onChange={(id) =>
            modify((d) => {
              d.level.id = id;
            })
          }
        />
        <TextInput
          label="Course name"
          value={doc.editor.name}
          onChange={(name) =>
            modify((d) => {
              d.editor.name = name;
            })
          }
        />
        <NumberInput
          label="Level version"
          value={doc.level.version}
          step={1}
          onChange={(version) =>
            modify((d) => {
              d.level.version = version;
            })
          }
        />
        <p className="muted">
          Saving changed game data advances the content version automatically.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={!!doc.level.prediction}
            onChange={(e) =>
              modify((d) => {
                if (e.target.checked) d.level.prediction = { maxTicks: 1200, sampleEveryTicks: 8 };
                else delete d.level.prediction;
              })
            }
          />
          Custom prediction defaults
        </label>
        {doc.level.prediction && (
          <>
            <NumberInput
              label="Prediction max ticks"
              value={doc.level.prediction.maxTicks}
              step={1}
              onChange={(n) =>
                modify((d) => {
                  d.level.prediction!.maxTicks = n;
                })
              }
            />
            <NumberInput
              label="Prediction sample ticks"
              value={doc.level.prediction.sampleEveryTicks}
              step={1}
              onChange={(n) =>
                modify((d) => {
                  d.level.prediction!.sampleEveryTicks = n;
                })
              }
            />
          </>
        )}
        <VectorInputs
          label="Gravity"
          value={doc.level.gravity}
          onChange={(v) =>
            modify((d) => {
              d.level.gravity = { ...v };
            })
          }
        />
        <p className="muted">
          Select an object to edit its geometry and properties. Save As by changing the level ID.
        </p>
        <p className="muted">
          Bounds apply to the full shape, including disabled fields. Overlapping objects are
          allowed.
        </p>
      </section>
    );
  if (selection.kind === 'goal') {
    const goal = doc.level.goal,
      b = goal;
    return (
      <section className="inspector-content">
        <h2>Goal</h2>
        <label className="property">
          <span>Target body</span>
          <select
            value={goal.bodyId}
            onChange={(e) =>
              modify((d) => {
                d.level.goal.bodyId = e.target.value;
              })
            }
          >
            {doc.level.dynamicBodies.map((body) => (
              <option key={body.id}>{body.id}</option>
            ))}
          </select>
        </label>
        <NumberInput
          label="Hold seconds"
          value={goal.holdSeconds}
          onChange={(n) =>
            modify((d) => {
              d.level.goal.holdSeconds = n;
            })
          }
        />
        {(['minX', 'maxX', 'minY', 'maxY'] as const).map((key) => (
          <NumberInput
            key={key}
            label={`Goal ${key}`}
            value={b[key]}
            onChange={(n) =>
              modify((d) => {
                d.level.goal[key] = n;
              })
            }
          />
        ))}
        <p className="muted">
          The target body’s origin must stay inside this box. This is the main game’s goal rule.
        </p>
      </section>
    );
  }
  if (!object) return null;
  if (doc.editor.arena.walls.includes(object.id))
    return (
      <section className="inspector-content">
        <h2>Boundary wall</h2>
        <p>{object.id}</p>
        <p className="muted">
          Use the Board dimensions or drag the board edge handles to resize the four walls together.
        </p>
      </section>
    );
  const shapeList = shapes(object),
    bounds = localBounds(object);
  const selectedPiece = Math.min(piece, shapeList.length - 1),
    selectedShape = shapeList[selectedPiece]!;
  const polygon = selectedShape.kind === 'circle' ? [] : shapePolygon(selectedShape);
  return (
    <section className="inspector-content">
      <h2>
        {selection.kind === 'fields'
          ? 'Force field'
          : selection.kind === 'dynamicBodies'
            ? 'Dynamic body'
            : 'Static body'}
      </h2>
      <TextInput label="Object ID" value={object.id} onChange={(id) => onRename(id)} />
      <VectorInputs
        label="Position"
        value={object.position}
        onChange={(v) =>
          change((o) => {
            o.position = { ...v };
          })
        }
      />
      <NumberInput
        label="Rotation (degrees)"
        value={(object.angle * 180) / Math.PI}
        onChange={(angle) =>
          change((o) => {
            o.angle = (angle * Math.PI) / 180;
          })
        }
      />
      <div className="property-pair">
        <NumberInput
          label="Local width"
          value={bounds.maxX - bounds.minX}
          onChange={(w) =>
            apply((d) =>
              scaleObject(
                d,
                selection,
                w,
                hasCircle(object)
                  ? ((bounds.maxY - bounds.minY) * w) / (bounds.maxX - bounds.minX)
                  : bounds.maxY - bounds.minY,
              ),
            )
          }
        />
        <NumberInput
          label="Local height"
          value={bounds.maxY - bounds.minY}
          onChange={(h) =>
            apply((d) =>
              scaleObject(
                d,
                selection,
                hasCircle(object)
                  ? ((bounds.maxX - bounds.minX) * h) / (bounds.maxY - bounds.minY)
                  : bounds.maxX - bounds.minX,
                h,
              ),
            )
          }
        />
      </div>
      {'material' in object && (
        <NumberInput
          label="Restitution"
          value={object.material.restitution}
          onChange={(v) =>
            change((o) => {
              if ('material' in o) o.material.restitution = v;
            })
          }
        />
      )}
      {isDynamic(object) && (
        <>
          <NumberInput
            label="Body density"
            value={object.density}
            onChange={(n) =>
              change((o) => {
                if (isDynamic(o)) o.density = n;
              })
            }
          />
          <VectorInputs
            label="Initial velocity"
            value={object.linearVelocity ?? { x: 0, y: 0 }}
            onChange={(v) =>
              change((o) => {
                if (isDynamic(o)) o.linearVelocity = { ...v };
              })
            }
          />
          <NumberInput
            label="Angular velocity"
            value={object.angularVelocity ?? 0}
            onChange={(n) =>
              change((o) => {
                if (isDynamic(o)) o.angularVelocity = n;
              })
            }
          />
          <label className="check">
            <input
              type="checkbox"
              checked={object.ccd}
              onChange={(e) =>
                change((o) => {
                  if (isDynamic(o)) o.ccd = e.target.checked;
                })
              }
            />
            Continuous collision detection
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={object.canSleep ?? true}
              onChange={(e) =>
                change((o) => {
                  if (isDynamic(o)) o.canSleep = e.target.checked;
                })
              }
            />
            Can sleep
          </label>
        </>
      )}
      {'force' in object && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={object.enabled}
              onChange={(e) =>
                change((o) => {
                  if ('enabled' in o) o.enabled = e.target.checked;
                })
              }
            />
            Enabled at start
          </label>
          <h3>{forceDefinition(object.force.kind).label}</h3>
          {Object.entries(forceDefinition(object.force.kind).parameters).map(([key, spec]) => {
            const value = (object.force as unknown as Record<string, FieldParam>)[key]!;
            const update = (v: typeof value) =>
              change((o) => {
                if ('force' in o) (o.force as unknown as Record<string, FieldParam>)[key] = v;
              });
            if (spec.type === 'vector')
              return (
                <VectorInputs
                  key={key}
                  label={spec.label}
                  value={value as Vec2}
                  onChange={update}
                />
              );
            if (spec.type === 'number')
              return (
                <NumberInput
                  key={key}
                  label={spec.label}
                  value={value as number}
                  onChange={update}
                />
              );
            if (spec.type === 'boolean')
              return (
                <label key={key} className="check">
                  <input
                    type="checkbox"
                    checked={value as boolean}
                    onChange={(e) => update(e.target.checked)}
                  />
                  {spec.label}
                </label>
              );
            return (
              <TextInput key={key} label={spec.label} value={value as string} onChange={update} />
            );
          })}
        </>
      )}
      <h3>Geometry</h3>
      <label className="property">
        <span>Shape type</span>
        <select
          aria-label="Shape type"
          value={selectedShape.kind}
          onChange={(e) =>
            change((o) => {
              const owner = 'pieces' in o ? o.pieces[selectedPiece]! : o;
              if (e.target.value === 'circle' && 'pieces' in o)
                owner.shape = { kind: 'circle', radius: 0.4 };
              else if (e.target.value === 'rectangle')
                owner.shape = { kind: 'rectangle', width: 1, height: 1 };
              else if (e.target.value === 'polygon')
                owner.shape = { kind: 'polygon', points: shapeOutline(owner.shape) };
            })
          }
        >
          <option value="rectangle">Rectangle</option>
          <option value="polygon">Polygon</option>
          {'pieces' in object && <option value="circle">Circle (Rapier ball)</option>}
        </select>
      </label>
      {selectedShape.kind === 'circle' && (
        <>
          <NumberInput
            label="Radius"
            value={selectedShape.radius}
            onChange={(radius) =>
              change((o) => {
                if ('pieces' in o) o.pieces[selectedPiece]!.shape = { kind: 'circle', radius };
              })
            }
          />
          <p className="muted">
            True circle collider with disc mass and inertia. Resizing keeps it circular. Convert to
            polygon explicitly to edit vertices.
          </p>
        </>
      )}

      <label className="check">
        <input type="checkbox" checked={vertices} onChange={(e) => setVertices(e.target.checked)} />
        Show vertex handles
      </label>
      {'pieces' in object && (
        <>
          <label className="property">
            <span>Convex piece</span>
            <select
              aria-label="Convex piece"
              value={selectedPiece}
              onChange={(e) => setPiece(Number(e.target.value))}
            >
              {object.pieces.map((p, i) => (
                <option value={i} key={p.id}>
                  {p.id}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button
              onClick={() =>
                change((o) => {
                  if ('pieces' in o) {
                    let i = o.pieces.length + 1;
                    while (o.pieces.some((p) => p.id === `${o.id}-piece-${i}`)) i++;
                    o.pieces.push({
                      id: `${o.id}-piece-${i}`,
                      shape: { kind: 'rectangle', width: 0.6, height: 0.6 },
                    });
                  }
                })
              }
            >
              Add piece
            </button>
            <button
              disabled={object.pieces.length === 1}
              onClick={() => {
                change((o) => {
                  if ('pieces' in o) o.pieces.splice(selectedPiece, 1);
                });
                setPiece(0);
              }}
            >
              Remove piece
            </button>
          </div>
          <TextInput
            label="Piece ID"
            value={object.pieces[selectedPiece]!.id}
            onChange={(id) =>
              change((o) => {
                if ('pieces' in o) o.pieces[selectedPiece]!.id = id;
              })
            }
          />
          {isDynamic(object) && (
            <>
              <NumberInput
                label="Piece density"
                value={object.pieces[selectedPiece]!.density ?? object.density}
                onChange={(n) =>
                  change((o) => {
                    if ('pieces' in o) o.pieces[selectedPiece]!.density = n;
                  })
                }
              />
              <button
                onClick={() =>
                  change((o) => {
                    if ('pieces' in o) delete o.pieces[selectedPiece]!.density;
                  })
                }
              >
                Use body density
              </button>
            </>
          )}
        </>
      )}
      <p className="muted">
        Local coordinates. Solid pieces must be convex and counter-clockwise. Fields can be concave.
      </p>
      <div className="vertex-list">
        {polygon.map((point, index) => (
          <div className="vertex-row" key={`${selectedPiece}-${index}`}>
            <span>{index + 1}</span>
            <NumberInput
              label={`Vertex ${index + 1} X`}
              value={point.x}
              onChange={(x) =>
                change((o) => {
                  editablePolygon(o, selectedPiece)[index]!.x = x;
                })
              }
            />
            <NumberInput
              label={`Vertex ${index + 1} Y`}
              value={point.y}
              onChange={(y) =>
                change((o) => {
                  editablePolygon(o, selectedPiece)[index]!.y = y;
                })
              }
            />
            <button
              title="Insert midpoint after vertex"
              aria-label={`Insert after vertex ${index + 1}`}
              onClick={() =>
                change((o) => {
                  const p = editablePolygon(o, selectedPiece);
                  const a = p[index]!,
                    b = p[(index + 1) % p.length]!;
                  p.splice(index + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
                })
              }
            >
              +
            </button>
            <button
              aria-label={`Delete vertex ${index + 1}`}
              disabled={polygon.length <= 3}
              onClick={() =>
                change((o) => {
                  const p = editablePolygon(o, selectedPiece);
                  p.splice(index, 1);
                })
              }
            >
              −
            </button>
          </div>
        ))}
      </div>
      <details>
        <summary>Replace with a custom outline</summary>
        <p className="muted">
          Enter one local x,y pair per line. A solid outline is split into convex pieces by the
          game’s triangulator. Replaces all pieces and their density overrides.
        </p>
        <textarea
          aria-label="Custom outline"
          rows={6}
          placeholder={'-1,-1\n1,-1\n1,1\n-1,1'}
          value={outline}
          onChange={(e) => setOutlineText(e.target.value)}
        />
        <button
          onClick={() =>
            apply((d) => {
              const points = outline
                .trim()
                .split('\n')
                .map((line) => {
                  const parts = line.trim().split(/[\s,]+/);
                  if (parts.length !== 2) throw new Error('Enter two coordinates per line');
                  return { x: Number(parts[0]), y: Number(parts[1]) };
                });
              return setOutline(d, selection, points);
            })
          }
        >
          Apply outline
        </button>
      </details>
    </section>
  );
}
