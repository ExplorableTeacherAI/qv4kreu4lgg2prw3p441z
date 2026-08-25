/**
 * Section 3 — Splitting a Four-Sided Shape
 *
 * Bespoke figure: a four-cornered shape whose corners can be dragged, and a
 * diagonal the student draws themselves by clicking two corners. Joining two
 * opposite corners reveals two triangles, so the four angles must add to 360.
 */

import React, { useRef, useState, type ReactElement } from "react";
import { StackLayout } from "@/components/layouts";
import { Block } from "@/components/templates";
import {
    EditableH2,
    EditableParagraph,
    InlineClozeInput,
    InlineFeedback,
    InlineLinkedHighlight,
    InteractionHintSequence,
} from "@/components/atoms";
import { Figure } from "@/components/molecules";
import { useVar, useSetVar } from "@/stores";
import { clamp, type Vec2 } from "@/lib/motion";
import {
    clozePropsFromDefinition,
    getVariableInfo,
    linkedHighlightPropsFromDefinition,
} from "../variables";

// ── View constants ───────────────────────────────────────────────────────────

const VIEW_WIDTH = 560;
const VIEW_HEIGHT = 380;

const MIN_X = 60;
const MAX_X = 500;
const MIN_Y = 78;
const MAX_Y = 316;

const DEFAULT_CORNERS = [120, 112, 400, 92, 448, 268, 96, 286];

const INK = "#334155";
const INK_STRUCTURE = "#64748B";
const INK_QUIET = "#CBD5E1";

const FIRST_TRIANGLE = "#62D0AD";
const SECOND_TRIANGLE = "#AC8BF9";

const EASE_150 = { transition: "opacity 150ms ease, stroke-width 150ms ease" } as const;

// ── Geometry ─────────────────────────────────────────────────────────────────

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const directionDegrees = (from: Vec2, to: Vec2) =>
    toDegrees(Math.atan2(from.y - to.y, to.x - from.x));

const wrapSigned = (degrees: number) => (((degrees + 180) % 360) + 360) % 360 - 180;

const pointOnCircle = (centre: Vec2, radius: number, degrees: number): Vec2 => ({
    x: centre.x + radius * Math.cos((degrees * Math.PI) / 180),
    y: centre.y - radius * Math.sin((degrees * Math.PI) / 180),
});

const sectorPath = (centre: Vec2, radius: number, start: number, end: number) => {
    const from = pointOnCircle(centre, radius, start);
    const to = pointOnCircle(centre, radius, end);
    const largeArc = Math.abs(end - start) > 180 ? 1 : 0;
    const sweep = end > start ? 0 : 1;
    return `M ${centre.x} ${centre.y} L ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${to.x} ${to.y} Z`;
};

/** Shoelace area in SVG coordinates (y down). */
const signedAreaSvg = (points: Vec2[]) => {
    let total = 0;
    for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        total += current.x * next.y - next.x * current.y;
    }
    return total / 2;
};

/** Interior angles, correct even when a corner is pushed inwards. */
const interiorAngles = (points: Vec2[]) => {
    const standardOrientation = -signedAreaSvg(points);
    return points.map((vertex, index) => {
        const previous = points[(index + points.length - 1) % points.length];
        const next = points[(index + 1) % points.length];
        const signed = wrapSigned(
            directionDegrees(vertex, next) - directionDegrees(vertex, previous),
        );
        const oriented = standardOrientation > 0 ? -signed : signed;
        const interior = ((oriented % 360) + 360) % 360;
        const startAngle = directionDegrees(vertex, standardOrientation > 0 ? next : previous);
        return { size: interior, startAngle, sweep: interior };
    });
};

const segmentsCross = (a: Vec2, b: Vec2, c: Vec2, d: Vec2) => {
    const side = (p: Vec2, q: Vec2, r: Vec2) =>
        Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return (
        side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b)
    );
};

const isSimpleQuad = (points: Vec2[]) =>
    !segmentsCross(points[0], points[1], points[2], points[3]) &&
    !segmentsCross(points[1], points[2], points[3], points[0]);

const formatAngle = (degrees: number) => `${Math.round(degrees)}°`;

// ── Shared highlight contract ────────────────────────────────────────────────

const useHighlightState = () => {
    const highlight = useVar<string>("quadHighlight", "");
    const setVar = useSetVar();
    return {
        opacity: (id: string) => (highlight && highlight !== id ? 0.35 : 1),
        weight: (id: string, resting: number) => (highlight === id ? resting * 1.6 : resting),
        isActive: (id: string) => highlight === id,
        hoverProps: (id: string) => ({
            onPointerEnter: () => setVar("quadHighlight", id),
            onPointerLeave: () => setVar("quadHighlight", ""),
        }),
    };
};

const Halo = ({ active, children }: { active: boolean; children: React.ReactNode }) =>
    active ? <g opacity={0.28}>{children}</g> : null;

// ── The drawing ──────────────────────────────────────────────────────────────

function QuadrilateralSplitDrawing() {
    const setVar = useSetVar();
    const flatCorners = useVar<number[]>("quadVertices", DEFAULT_CORNERS);
    const diagonal = useVar<string>("quadDiagonal", "");
    const attempt = useVar<string>("quadAttempt", "");
    const { opacity, weight, isActive, hoverProps } = useHighlightState();

    const [pendingCorner, setPendingCorner] = useState<number | null>(null);
    const [hoveredCorner, setHoveredCorner] = useState<number | null>(null);
    const draggingRef = useRef<number | null>(null);
    const movedRef = useRef(false);
    const downPointRef = useRef<Vec2>({ x: 0, y: 0 });
    const svgRef = useRef<SVGSVGElement>(null);

    const corners: Vec2[] = [0, 1, 2, 3].map((index) => ({
        x: flatCorners[index * 2],
        y: flatCorners[index * 2 + 1],
    }));

    const angles = interiorAngles(corners);
    const shown = angles.map((angle) => Math.round(angle.size));
    shown[3] = 360 - shown[0] - shown[1] - shown[2];

    const handlePointerMove = (event: React.PointerEvent<SVGCircleElement>) => {
        const index = draggingRef.current;
        if (index === null || !svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const moved: Vec2 = {
            x: clamp(((event.clientX - rect.left) / rect.width) * VIEW_WIDTH, MIN_X, MAX_X),
            y: clamp(((event.clientY - rect.top) / rect.height) * VIEW_HEIGHT, MIN_Y, MAX_Y),
        };
        // A few pixels of jitter is a click, not a drag.
        if (Math.hypot(moved.x - downPointRef.current.x, moved.y - downPointRef.current.y) < 5) return;
        movedRef.current = true;
        const candidate = corners.map((corner, cornerIndex) =>
            cornerIndex === index ? moved : corner,
        );
        if (!isSimpleQuad(candidate)) return; // keep the shape from folding over itself
        const next = [...flatCorners];
        next[index * 2] = moved.x;
        next[index * 2 + 1] = moved.y;
        setVar("quadVertices", next);
    };

    const handleCornerClick = (index: number) => {
        if (pendingCorner === null) {
            setPendingCorner(index);
            setVar("quadAttempt", "");
            return;
        }
        if (pendingCorner === index) {
            setPendingCorner(null);
            return;
        }
        const gap = Math.abs(pendingCorner - index);
        if (gap === 2) {
            setVar("quadDiagonal", pendingCorner % 2 === 0 ? "02" : "13");
            setVar("quadAttempt", "diagonal");
        } else {
            setVar("quadAttempt", "side");
        }
        setPendingCorner(null);
    };

    const centroid: Vec2 = {
        x: corners.reduce((sum, corner) => sum + corner.x, 0) / 4,
        y: corners.reduce((sum, corner) => sum + corner.y, 0) / 4,
    };
    const labelPosition = (vertex: Vec2) => {
        const dx = centroid.x - vertex.x;
        const dy = centroid.y - vertex.y;
        const length = Math.hypot(dx, dy) || 1;
        return { x: vertex.x + (dx / length) * 50, y: vertex.y + (dy / length) * 50 + 4 };
    };

    const splitIndices: [number[], number[]] | null =
        diagonal === "02" ? [[0, 1, 2], [0, 2, 3]] : diagonal === "13" ? [[1, 2, 3], [1, 3, 0]] : null;

    const pointsOf = (indices: number[]) =>
        indices.map((index) => `${corners[index].x},${corners[index].y}`).join(" ");
    const centreOf = (indices: number[]): Vec2 => ({
        x: indices.reduce((sum, index) => sum + corners[index].x, 0) / 3,
        y: indices.reduce((sum, index) => sum + corners[index].y, 0) / 3,
    });

    const statusText = splitIndices
        ? "Two triangles, and nothing was added to the shape."
        : attempt === "side"
          ? "Those two corners sit next to each other, so that line is a side."
          : "Click one corner, then the corner across from it.";

    return (
        <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            className="block w-full select-none"
            role="img"
            aria-label="A four sided shape with draggable corners that can be split into two triangles"
        >
            <defs>
                <filter id="quad-corner-shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#0F172A" floodOpacity="0.25" />
                </filter>
            </defs>

            {/* Live running total of the four corner angles. */}
            <text
                x={VIEW_WIDTH / 2}
                y="34"
                textAnchor="middle"
                fontSize="14"
                fill={INK}
                style={{ fontVariantNumeric: "tabular-nums", ...EASE_150 }}
                opacity={opacity("corners")}
            >
                {`${formatAngle(shown[0])} + ${formatAngle(shown[1])} + ${formatAngle(shown[2])} + ${formatAngle(shown[3])}`}
                <tspan fontWeight="600">{`  =  360°`}</tspan>
            </text>

            {/* Ghost of the starting shape — the before-state reference. */}
            <polygon
                points="120,112 400,92 448,268 96,286"
                fill="none"
                stroke={INK_QUIET}
                strokeWidth="1.5"
                strokeDasharray="4 5"
                opacity={opacity("__structure")}
                style={EASE_150}
            />

            {/* The two triangles the diagonal reveals. */}
            {splitIndices && (
                <g {...hoverProps("triangles")} opacity={opacity("triangles")} style={EASE_150}>
                    {splitIndices.map((indices, index) => {
                        const colour = index === 0 ? FIRST_TRIANGLE : SECOND_TRIANGLE;
                        const middle = centreOf(indices);
                        return (
                            <g key={index}>
                                <polygon
                                    points={pointsOf(indices)}
                                    fill={colour}
                                    fillOpacity={isActive("triangles") ? 0.35 : 0.16}
                                    stroke="none"
                                />
                                <text
                                    x={middle.x}
                                    y={middle.y + 4}
                                    fill={colour}
                                    fontSize="14"
                                    fontWeight="600"
                                    textAnchor="middle"
                                    style={{ fontVariantNumeric: "tabular-nums" }}
                                >
                                    180°
                                </text>
                            </g>
                        );
                    })}
                    <Halo active={isActive("triangles")}>
                        <line
                            x1={corners[splitIndices[0][0]].x}
                            y1={corners[splitIndices[0][0]].y}
                            x2={corners[splitIndices[0][2]].x}
                            y2={corners[splitIndices[0][2]].y}
                            stroke={FIRST_TRIANGLE}
                            strokeWidth={weight("triangles", 3.5) + 6}
                            strokeLinecap="round"
                        />
                    </Halo>
                    <line
                        x1={corners[splitIndices[0][0]].x}
                        y1={corners[splitIndices[0][0]].y}
                        x2={corners[splitIndices[0][2]].x}
                        y2={corners[splitIndices[0][2]].y}
                        stroke={FIRST_TRIANGLE}
                        strokeWidth={weight("triangles", 3.5)}
                        strokeLinecap="round"
                    />
                </g>
            )}

            {/* The shape outline. */}
            <polygon
                points={corners.map((corner) => `${corner.x},${corner.y}`).join(" ")}
                fill={splitIndices ? "none" : "#F8FAFC"}
                stroke={INK_STRUCTURE}
                strokeWidth="2"
                strokeLinejoin="round"
                opacity={opacity("__structure")}
                style={EASE_150}
            />

            {/* The four corner angles. */}
            <g {...hoverProps("corners")} opacity={opacity("corners")} style={EASE_150}>
                {corners.map((corner, index) => {
                    const previous = corners[(index + 3) % 4];
                    const next = corners[(index + 1) % 4];
                    const radius = Math.min(
                        30,
                        0.3 * Math.min(Math.hypot(corner.x - previous.x, corner.y - previous.y),
                            Math.hypot(corner.x - next.x, corner.y - next.y)),
                    );
                    const label = labelPosition(corner);
                    return (
                        <g key={index}>
                            <path
                                d={sectorPath(
                                    corner,
                                    radius,
                                    angles[index].startAngle,
                                    angles[index].startAngle + angles[index].sweep,
                                )}
                                fill={INK_STRUCTURE}
                                fillOpacity={isActive("corners") ? 0.28 : 0.12}
                                stroke={INK_STRUCTURE}
                                strokeWidth={weight("corners", 2)}
                                strokeLinejoin="round"
                            />
                            <text
                                x={label.x}
                                y={label.y}
                                fill={INK}
                                fontSize="12"
                                textAnchor="middle"
                                style={{ fontVariantNumeric: "tabular-nums" }}
                            >
                                {formatAngle(shown[index])}
                            </text>
                        </g>
                    );
                })}
            </g>

            {/* Draggable, clickable corners. */}
            {corners.map((corner, index) => (
                <g key={`handle-${index}`}>
                    <circle
                        cx={corner.x}
                        cy={corner.y}
                        r={pendingCorner === index || hoveredCorner === index ? 10 : 8}
                        fill={pendingCorner === index ? "#F7B23B" : FIRST_TRIANGLE}
                        filter="url(#quad-corner-shadow)"
                        style={{ transition: "r 150ms ease" }}
                    />
                    <circle
                        cx={corner.x}
                        cy={corner.y}
                        r="24"
                        fill="transparent"
                        style={{ cursor: "pointer", touchAction: "none" }}
                        onPointerDown={(event) => {
                            event.currentTarget.setPointerCapture(event.pointerId);
                            draggingRef.current = index;
                            movedRef.current = false;
                            downPointRef.current = { x: corner.x, y: corner.y };
                        }}
                        onPointerMove={handlePointerMove}
                        onPointerUp={() => {
                            if (draggingRef.current === index && !movedRef.current) {
                                handleCornerClick(index);
                            }
                            draggingRef.current = null;
                        }}
                        onPointerCancel={() => {
                            draggingRef.current = null;
                        }}
                        onPointerEnter={() => setHoveredCorner(index)}
                        onPointerLeave={() => setHoveredCorner(null)}
                    />
                </g>
            ))}

            {/* Status line — always inside the safe band. */}
            <text
                x={VIEW_WIDTH / 2}
                y={VIEW_HEIGHT - 26}
                textAnchor="middle"
                fontSize="12"
                fill={attempt === "side" && !splitIndices ? "#F7B23B" : INK}
            >
                {statusText}
            </text>
        </svg>
    );
}

function QuadrilateralSplitFigure() {
    const setVar = useSetVar();
    return (
        <Figure
            id="quadrilateral-split"
            onReset={() => {
                setVar("quadVertices", DEFAULT_CORNERS);
                setVar("quadDiagonal", "");
                setVar("quadAttempt", "");
                setVar("quadHighlight", "");
            }}
            caption="Click one corner and then the corner across from it to draw a diagonal. Drag any corner afterwards to bend the shape out of shape."
        >
            <QuadrilateralSplitDrawing />
            <InteractionHintSequence
                hintKey="quadrilateral-diagonal-click"
                steps={[
                    {
                        gesture: "click",
                        label: "Click a corner, then the corner across from it",
                        position: { x: "22%", y: "24%" },
                    },
                ]}
            />
        </Figure>
    );
}

// ── Blocks ───────────────────────────────────────────────────────────────────

export const quadrilateralSplitBlocks: ReactElement[] = [
    <StackLayout key="layout-quad-heading" maxWidth="xl">
        <Block id="quad-heading" padding="md">
            <EditableH2 id="h2-quad-heading" blockId="quad-heading">
                Splitting a Four-Sided Shape
            </EditableH2>
        </Block>
    </StackLayout>,

    <StackLayout key="layout-quad-setup" maxWidth="xl">
        <Block id="quad-setup" padding="sm">
            <EditableParagraph id="para-quad-setup" blockId="quad-setup">
                Now add one more corner. A four-sided shape looks like a fresh problem
                until you join two opposite corners, and it falls apart into{" "}
                <InlineLinkedHighlight
                    varName="quadHighlight"
                    highlightId="triangles"
                    {...linkedHighlightPropsFromDefinition(getVariableInfo("quadHighlight"))}
                >
                    two triangles
                </InlineLinkedHighlight>
                . Drag the corners afterwards to bend it about, and watch the{" "}
                <InlineLinkedHighlight
                    varName="quadHighlight"
                    highlightId="corners"
                    {...linkedHighlightPropsFromDefinition(getVariableInfo("quadHighlight"))}
                >
                    four angles
                </InlineLinkedHighlight>{" "}
                trade sizes.
            </EditableParagraph>
        </Block>
    </StackLayout>,

    <StackLayout key="layout-quad-figure" maxWidth="xl">
        <Block id="quad-figure" padding="sm" hasVisualization>
            <QuadrilateralSplitFigure />
        </Block>
    </StackLayout>,

    <StackLayout key="layout-quad-insight" maxWidth="xl">
        <Block id="quad-insight" padding="sm">
            <EditableParagraph id="para-quad-insight" blockId="quad-insight">
                Two triangles, 180 degrees each, so the four angles add to 360. The
                diagonal did not add anything to the shape. It only revealed triangles
                that were hiding there all along.
            </EditableParagraph>
        </Block>
    </StackLayout>,

    <StackLayout key="layout-quad-question" maxWidth="xl">
        <Block id="quad-question" padding="sm">
            <EditableParagraph id="para-quad-question" blockId="quad-question">
                A kite and a long thin dart look nothing alike, yet each one has four
                corners, so the angles of both add to{" "}
                <InlineFeedback
                    varName="answerQuadSum"
                    correctValue={["360", "360°"]}
                    position="terminal"
                    successMessage="— yes, and the shape can be as odd as you like, since two triangles still fit inside it"
                    failureMessage="— have another go."
                    hint="Count the triangles you can cut it into, then take 180 for each one"
                    reviewBlockId="quad-figure"
                    reviewLabel="Back to the shape"
                >
                    <InlineClozeInput
                        varName="answerQuadSum"
                        correctAnswer={["360", "360°"]}
                        {...clozePropsFromDefinition(getVariableInfo("answerQuadSum"))}
                    />
                </InlineFeedback>{" "}
                degrees.
            </EditableParagraph>
        </Block>
    </StackLayout>,
];
