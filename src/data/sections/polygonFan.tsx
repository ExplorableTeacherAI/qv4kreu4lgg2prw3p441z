/**
 * Section 4 — Counting the Triangles Inside Any Polygon
 *
 * A LINKED PAIR (one case ↔ many cases). Left: a polygon whose corners can be
 * dragged and whose diagonals fan out from whichever corner the student clicks.
 * Right: the angle sum plotted against the number of sides, with a draggable
 * marker. Both read `polygonSides` and `polygonHighlight` from the store —
 * nothing else connects them.
 */

import React, { useRef, useState, type ReactElement } from "react";
import { SplitLayout, StackLayout } from "@/components/layouts";
import { Block } from "@/components/templates";
import {
    EditableH2,
    EditableParagraph,
    InlineClozeInput,
    InlineFeedback,
    InlineLinkedHighlight,
    InlineScrubbleNumber,
    InteractionHintSequence,
} from "@/components/atoms";
import { Figure, FigureSlider, FormulaBlock } from "@/components/molecules";
import { useVar, useSetVar } from "@/stores";
import { clamp, remap, useSpring, type Vec2 } from "@/lib/motion";
import {
    clozePropsFromDefinition,
    getVariableInfo,
    linkedHighlightPropsFromDefinition,
    numberPropsFromDefinition,
    scrubVarsFromDefinitions,
} from "../variables";

// ── Shared view geometry ─────────────────────────────────────────────────────

const VIEW_WIDTH = 380;
const VIEW_HEIGHT = 340;

const CENTRE: Vec2 = { x: 190, y: 166 };
const BASE_RADIUS = 92;
const MIN_FACTOR = 0.62;
const MAX_FACTOR = 1.34;

const PLOT_LEFT = 74;
const PLOT_RIGHT = 344;
const PLOT_TOP = 78;
const PLOT_BOTTOM = 268;

const MIN_SIDES = 3;
const MAX_SIDES = 10;
const DEFAULT_SIDES = 5;
const MAX_SUM = 1440;

const INK = "#334155";
const INK_STRUCTURE = "#64748B";
const INK_QUIET = "#CBD5E1";
const ACCENT = "#62D0AD";

const EASE_150 = { transition: "opacity 150ms ease, stroke-width 150ms ease" } as const;

// One formatter per quantity, used by BOTH views and the prose.
const formatSides = (sides: number) => `${Math.round(sides)} sides`;
const formatSum = (sum: number) => `${Math.round(sum)}°`;
const triangleCount = (sides: number) => Math.round(sides) - 2;
const angleSum = (sides: number) => triangleCount(sides) * 180;

// ── Shared highlight contract — both views obey it ───────────────────────────

const useHighlightState = () => {
    const highlight = useVar<string>("polygonHighlight", "");
    const setVar = useSetVar();
    return {
        opacity: (id: string) => (highlight && highlight !== id ? 0.35 : 1),
        weight: (id: string, resting: number) => (highlight === id ? resting * 1.6 : resting),
        isActive: (id: string) => highlight === id,
        hoverProps: (id: string) => ({
            onPointerEnter: () => setVar("polygonHighlight", id),
            onPointerLeave: () => setVar("polygonHighlight", ""),
        }),
    };
};

const Halo = ({ active, children }: { active: boolean; children: React.ReactNode }) =>
    active ? <g opacity={0.28}>{children}</g> : null;

const svgPointFromEvent = (event: React.PointerEvent, svg: SVGSVGElement | null): Vec2 => {
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * VIEW_HEIGHT,
    };
};

// ── VIEW A — the polygon itself (one case) ───────────────────────────────────

function PolygonFanDrawing() {
    const setVar = useSetVar();
    const sides = useVar<number>("polygonSides", DEFAULT_SIDES);
    const fanChoice = useVar<number>("polygonFanVertex", 0);
    const radii = useVar<number[]>("polygonRadii", [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const { opacity, weight, isActive, hoverProps } = useHighlightState();

    const [hoveredCorner, setHoveredCorner] = useState<number | null>(null);
    const draggingRef = useRef<number | null>(null);
    const movedRef = useRef(false);
    const downPointRef = useRef<Vec2>({ x: 0, y: 0 });
    const svgRef = useRef<SVGSVGElement>(null);

    const count = Math.round(sides);
    const fanIndex = ((Math.round(fanChoice) % count) + count) % count;

    const cornerAt = (index: number): Vec2 => {
        const degrees = 90 + (index * 360) / count;
        const radius = BASE_RADIUS * (radii[index] ?? 1);
        return {
            x: CENTRE.x + radius * Math.cos((degrees * Math.PI) / 180),
            y: CENTRE.y - radius * Math.sin((degrees * Math.PI) / 180),
        };
    };
    const corners = Array.from({ length: count }, (_, index) => cornerAt(index));

    const handlePointerMove = (event: React.PointerEvent<SVGCircleElement>) => {
        const index = draggingRef.current;
        if (index === null) return;
        const point = svgPointFromEvent(event, svgRef.current);
        // A few pixels of jitter is a click, not a drag.
        if (Math.hypot(point.x - downPointRef.current.x, point.y - downPointRef.current.y) < 5) return;
        movedRef.current = true;
        const factor = clamp(
            Math.hypot(point.x - CENTRE.x, point.y - CENTRE.y) / BASE_RADIUS,
            MIN_FACTOR,
            MAX_FACTOR,
        );
        const next = [...radii];
        next[index] = factor;
        setVar("polygonRadii", next);
    };

    // Triangles fanned out from the chosen corner.
    const triangles = Array.from({ length: count - 2 }, (_, step) => {
        const first = (fanIndex + step + 1) % count;
        const second = (fanIndex + step + 2) % count;
        return [corners[fanIndex], corners[first], corners[second]];
    });

    return (
        <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            className="block w-full select-none"
            role="img"
            aria-label="A polygon with draggable corners, split into triangles fanning out from one corner"
        >
            <defs>
                <filter id="polygon-corner-shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#0F172A" floodOpacity="0.25" />
                </filter>
            </defs>

            <g fontSize="12" style={{ fontVariantNumeric: "tabular-nums", ...EASE_150 }}>
                <text x="24" y="30" fill={INK} opacity={opacity("__structure")}>
                    {formatSides(count)}
                </text>
                <text
                    x={VIEW_WIDTH - 24}
                    y="30"
                    fill={ACCENT}
                    textAnchor="end"
                    opacity={opacity("triangles")}
                >
                    {`${triangleCount(count)} triangles`}
                </text>
            </g>

            {/* Triangles and the diagonals that cut them out. */}
            <g {...hoverProps("triangles")} opacity={opacity("triangles")} style={EASE_150}>
                {triangles.map((triangle, index) => (
                    <polygon
                        key={`triangle-${index}`}
                        points={triangle.map((point) => `${point.x},${point.y}`).join(" ")}
                        fill={ACCENT}
                        fillOpacity={(isActive("triangles") ? 0.34 : 0.16) * (index % 2 === 0 ? 1 : 0.6)}
                        stroke="none"
                    />
                ))}
                {Array.from({ length: count - 3 }, (_, step) => {
                    const target = corners[(fanIndex + step + 2) % count];
                    return (
                        <g key={`diagonal-${step}`}>
                            <Halo active={isActive("triangles")}>
                                <line
                                    x1={corners[fanIndex].x}
                                    y1={corners[fanIndex].y}
                                    x2={target.x}
                                    y2={target.y}
                                    stroke={ACCENT}
                                    strokeWidth={weight("triangles", 3) + 6}
                                    strokeLinecap="round"
                                />
                            </Halo>
                            <line
                                x1={corners[fanIndex].x}
                                y1={corners[fanIndex].y}
                                x2={target.x}
                                y2={target.y}
                                stroke={ACCENT}
                                strokeWidth={weight("triangles", 3)}
                                strokeLinecap="round"
                            />
                        </g>
                    );
                })}
            </g>

            {/* The outline. */}
            <polygon
                points={corners.map((corner) => `${corner.x},${corner.y}`).join(" ")}
                fill="none"
                stroke={INK_STRUCTURE}
                strokeWidth="2"
                strokeLinejoin="round"
                opacity={opacity("__structure")}
                style={EASE_150}
            />

            {/* Corners: click to fan from here, drag to push in or out. */}
            {corners.map((corner, index) => (
                <g key={`corner-${index}`}>
                    <circle
                        cx={corner.x}
                        cy={corner.y}
                        r={index === fanIndex ? 9 : hoveredCorner === index ? 8 : 6}
                        fill={index === fanIndex ? ACCENT : INK_STRUCTURE}
                        filter="url(#polygon-corner-shadow)"
                        style={{ transition: "r 150ms ease" }}
                    />
                    <circle
                        cx={corner.x}
                        cy={corner.y}
                        r="22"
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
                                setVar("polygonFanVertex", index);
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

            {/* The shared total, spelled out. */}
            <g {...hoverProps("total")} opacity={opacity("total")} style={EASE_150}>
                <text
                    x={VIEW_WIDTH / 2}
                    y={VIEW_HEIGHT - 24}
                    textAnchor="middle"
                    fontSize="14"
                    fill={INK}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                >
                    {`${triangleCount(count)} × 180° = `}
                    <tspan fill={ACCENT} fontWeight="600">{formatSum(angleSum(count))}</tspan>
                </text>
            </g>
        </svg>
    );
}

// ── VIEW B — every case at once ──────────────────────────────────────────────

function PolygonSumGraphDrawing() {
    const setVar = useSetVar();
    const sides = useVar<number>("polygonSides", DEFAULT_SIDES);
    const { opacity, weight, isActive, hoverProps } = useHighlightState();

    const [dragging, setDragging] = useState(false);
    const [hovered, setHovered] = useState(false);
    const draggingRef = useRef(false);
    const svgRef = useRef<SVGSVGElement>(null);
    const handleScale = useSpring(dragging || hovered ? 1.15 : 1, {
        stiffness: 400,
        damping: 26,
    });

    const count = Math.round(sides);
    const xFor = (value: number) => remap(value, MIN_SIDES, MAX_SIDES, PLOT_LEFT, PLOT_RIGHT);
    const yFor = (sum: number) => remap(sum, 0, MAX_SUM, PLOT_BOTTOM, PLOT_TOP);

    const handlePointerMove = (event: React.PointerEvent<SVGCircleElement>) => {
        if (!draggingRef.current) return;
        const point = svgPointFromEvent(event, svgRef.current);
        const value = remap(point.x, PLOT_LEFT, PLOT_RIGHT, MIN_SIDES, MAX_SIDES);
        setVar("polygonSides", clamp(Math.round(value), MIN_SIDES, MAX_SIDES));
    };

    const allSides = Array.from({ length: MAX_SIDES - MIN_SIDES + 1 }, (_, index) => MIN_SIDES + index);
    const markerX = xFor(count);
    const markerY = yFor(angleSum(count));

    return (
        <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            className="block w-full select-none"
            role="img"
            aria-label="Graph of angle sum against number of sides, with a draggable marker"
        >
            <defs>
                <filter id="polygon-marker-shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#0F172A" floodOpacity="0.25" />
                </filter>
            </defs>

            <g fontSize="12" style={{ fontVariantNumeric: "tabular-nums", ...EASE_150 }}>
                <text x="24" y="30" fill={INK} opacity={opacity("__structure")}>
                    {formatSides(count)}
                </text>
            </g>

            {/* Axes and the one line the dots sit on. */}
            <g opacity={opacity("__structure")} style={EASE_150}>
                <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={PLOT_BOTTOM} stroke={INK_QUIET} strokeWidth="1.5" />
                <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke={INK_QUIET} strokeWidth="1.5" />
                <line
                    x1={xFor(MIN_SIDES)}
                    y1={yFor(angleSum(MIN_SIDES))}
                    x2={xFor(MAX_SIDES)}
                    y2={yFor(angleSum(MAX_SIDES))}
                    stroke={INK_QUIET}
                    strokeWidth="1.5"
                />
                {allSides.map((value) => (
                    <circle
                        key={`dot-${value}`}
                        cx={xFor(value)}
                        cy={yFor(angleSum(value))}
                        r="3.5"
                        fill={INK_STRUCTURE}
                    />
                ))}
                <g fill={INK} fontSize="11" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {allSides.map((value) => (
                        <text
                            key={value}
                            x={xFor(value)}
                            y={PLOT_BOTTOM + 20}
                            textAnchor={value === MAX_SIDES ? "end" : value === MIN_SIDES ? "start" : "middle"}
                        >
                            {value}
                        </text>
                    ))}
                    <text x={(PLOT_LEFT + PLOT_RIGHT) / 2} y={PLOT_BOTTOM + 40} textAnchor="middle">
                        number of sides
                    </text>
                </g>
            </g>

            {/* The one step that got us here: one more side, one more triangle. */}
            {count > MIN_SIDES && (
                <g {...hoverProps("triangles")} opacity={opacity("triangles")} style={EASE_150}>
                    <line
                        x1={xFor(count - 1)}
                        y1={yFor(angleSum(count - 1))}
                        x2={markerX}
                        y2={yFor(angleSum(count - 1))}
                        stroke={ACCENT}
                        strokeWidth="1.5"
                        strokeDasharray="3 4"
                    />
                    <Halo active={isActive("triangles")}>
                        <line
                            x1={markerX}
                            y1={yFor(angleSum(count - 1))}
                            x2={markerX}
                            y2={markerY}
                            stroke={ACCENT}
                            strokeWidth={weight("triangles", 2.5) + 6}
                            strokeLinecap="round"
                        />
                    </Halo>
                    <line
                        x1={markerX}
                        y1={yFor(angleSum(count - 1))}
                        x2={markerX}
                        y2={markerY}
                        stroke={ACCENT}
                        strokeWidth={weight("triangles", 2.5)}
                        strokeLinecap="round"
                    />
                    <text
                        x={markerX - 8}
                        y={(markerY + yFor(angleSum(count - 1))) / 2 + 4}
                        fill={ACCENT}
                        fontSize="11"
                        textAnchor="end"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                        +180°
                    </text>
                </g>
            )}

            {/* The shared total, read straight off the axis. */}
            <g {...hoverProps("total")} opacity={opacity("total")} style={EASE_150}>
                <Halo active={isActive("total")}>
                    <line
                        x1={PLOT_LEFT}
                        y1={markerY}
                        x2={markerX}
                        y2={markerY}
                        stroke={ACCENT}
                        strokeWidth={weight("total", 2) + 6}
                        strokeLinecap="round"
                    />
                </Halo>
                <line
                    x1={PLOT_LEFT}
                    y1={markerY}
                    x2={markerX}
                    y2={markerY}
                    stroke={ACCENT}
                    strokeWidth={weight("total", 2)}
                    strokeDasharray="4 5"
                />
                <text
                    x={PLOT_LEFT - 10}
                    y={markerY + 4}
                    fill={ACCENT}
                    fontSize="12"
                    textAnchor="end"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                >
                    {formatSum(angleSum(count))}
                </text>
            </g>

            {/* Draggable marker — the shared number of sides. */}
            <g transform={`translate(${markerX} ${markerY}) scale(${handleScale})`}>
                <circle r="9" fill={ACCENT} filter="url(#polygon-marker-shadow)" />
            </g>
            <circle
                cx={markerX}
                cy={markerY}
                r="24"
                fill="transparent"
                style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
                onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    draggingRef.current = true;
                    setDragging(true);
                }}
                onPointerMove={handlePointerMove}
                onPointerUp={() => {
                    draggingRef.current = false;
                    setDragging(false);
                }}
                onPointerCancel={() => {
                    draggingRef.current = false;
                    setDragging(false);
                }}
                onPointerEnter={() => setHovered(true)}
                onPointerLeave={() => setHovered(false)}
            />
        </svg>
    );
}

// ── Figure shells ────────────────────────────────────────────────────────────

function PolygonFanFigure() {
    const setVar = useSetVar();
    return (
        <Figure
            id="polygon-fan"
            onReset={() => {
                setVar("polygonSides", DEFAULT_SIDES);
                setVar("polygonFanVertex", 0);
                setVar("polygonRadii", [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
                setVar("polygonHighlight", "");
            }}
            caption="Click any corner to fan the diagonals out from it, or drag a corner in and out to distort the shape."
        >
            <PolygonFanDrawing />
            <InteractionHintSequence
                hintKey="polygon-fan-click"
                steps={[
                    {
                        gesture: "click",
                        label: "Click a corner to fan from it",
                        position: { x: "58%", y: "16%" },
                    },
                ]}
            />
        </Figure>
    );
}

function PolygonSumGraphFigure() {
    const setVar = useSetVar();
    return (
        <Figure
            id="polygon-sum-graph"
            onReset={() => {
                setVar("polygonSides", DEFAULT_SIDES);
                setVar("polygonHighlight", "");
            }}
            caption="Every shape from a triangle to a ten-sided one. Drag the marker along and the polygon beside it rebuilds itself."
        >
            <PolygonSumGraphDrawing />
            <div className="px-6 pb-5">
                <FigureSlider
                    varName="polygonSides"
                    label="Number of sides"
                    {...numberPropsFromDefinition(getVariableInfo("polygonSides"))}
                    formatValue={(value) => `${Math.round(value)}`}
                />
            </div>
            <InteractionHintSequence
                hintKey="polygon-graph-drag"
                steps={[
                    {
                        gesture: "drag-horizontal",
                        label: "Drag the marker to add sides",
                        position: { x: "40%", y: "48%" },
                        dragPath: { type: "line", startOffset: { x: -26, y: 8 }, endOffset: { x: 26, y: -8 } },
                    },
                ]}
            />
        </Figure>
    );
}

// ── Blocks ───────────────────────────────────────────────────────────────────

export const polygonFanBlocks: ReactElement[] = [
    <StackLayout key="layout-polygon-heading" maxWidth="xl">
        <Block id="polygon-heading" padding="md">
            <EditableH2 id="h2-polygon-heading" blockId="polygon-heading">
                Counting the Triangles Inside Any Polygon
            </EditableH2>
        </Block>
    </StackLayout>,

    <StackLayout key="layout-polygon-setup" maxWidth="xl">
        <Block id="polygon-setup" padding="sm">
            <EditableParagraph id="para-polygon-setup" blockId="polygon-setup">
                The same move works on a shape with{" "}
                <InlineScrubbleNumber
                    varName="polygonSides"
                    {...numberPropsFromDefinition(getVariableInfo("polygonSides"))}
                    formatValue={(value) => `${Math.round(value)}`}
                />{" "}
                sides. Click any corner and the diagonals fan out from it, cutting the
                shape into{" "}
                <InlineLinkedHighlight
                    varName="polygonHighlight"
                    highlightId="triangles"
                    {...linkedHighlightPropsFromDefinition(getVariableInfo("polygonHighlight"))}
                >
                    triangles
                </InlineLinkedHighlight>
                , and dragging a corner in or out never changes how many there are. The
                graph beside it keeps score of the{" "}
                <InlineLinkedHighlight
                    varName="polygonHighlight"
                    highlightId="total"
                    {...linkedHighlightPropsFromDefinition(getVariableInfo("polygonHighlight"))}
                >
                    running total
                </InlineLinkedHighlight>
                .
            </EditableParagraph>
        </Block>
    </StackLayout>,

    <SplitLayout key="layout-polygon-pair" ratio="1:1" gap="lg" align="start">
        <Block id="polygon-shape" padding="sm" hasVisualization>
            <PolygonFanFigure />
        </Block>
        <Block id="polygon-graph" padding="sm" hasVisualization>
            <PolygonSumGraphFigure />
        </Block>
    </SplitLayout>,

    <StackLayout key="layout-polygon-insight" maxWidth="xl">
        <Block id="polygon-insight" padding="sm">
            <EditableParagraph id="para-polygon-insight" blockId="polygon-insight">
                Every new side adds exactly one triangle, and every triangle brings
                another 180 degrees. Two of the sides are used up reaching the first
                triangle, which is why the count is always two fewer than the number of
                sides.
            </EditableParagraph>
        </Block>
    </StackLayout>,

    <StackLayout key="layout-polygon-formula" maxWidth="xl">
        <Block id="polygon-formula" padding="lg">
            <FormulaBlock
                latex="\text{angle sum} = (\scrub{polygonSides} - 2) \times 180^\circ"
                variables={scrubVarsFromDefinitions(["polygonSides"])}
            />
        </Block>
    </StackLayout>,

    <StackLayout key="layout-polygon-question" maxWidth="xl">
        <Block id="polygon-question" padding="sm">
            <EditableParagraph id="para-polygon-question" blockId="polygon-question">
                A stop sign has eight sides, so it splits into{" "}
                <InlineFeedback
                    varName="answerPolygonTriangles"
                    correctValue={["6", "six"]}
                    position="mid"
                    hint="Two of the sides are used up reaching the first triangle"
                >
                    <InlineClozeInput
                        varName="answerPolygonTriangles"
                        correctAnswer={["6", "six"]}
                        {...clozePropsFromDefinition(getVariableInfo("answerPolygonTriangles"))}
                    />
                </InlineFeedback>{" "}
                triangles, and its eight angles add to{" "}
                <InlineFeedback
                    varName="answerPolygonSum"
                    correctValue={["1080", "1080°"]}
                    position="terminal"
                    successMessage="— exactly, six triangles at 180 degrees each"
                    failureMessage="— close, try once more."
                    hint="Multiply the number of triangles by 180"
                    reviewBlockId="polygon-shape"
                    reviewLabel="Back to the polygon"
                >
                    <InlineClozeInput
                        varName="answerPolygonSum"
                        correctAnswer={["1080", "1080°"]}
                        {...clozePropsFromDefinition(getVariableInfo("answerPolygonSum"))}
                    />
                </InlineFeedback>{" "}
                degrees.
            </EditableParagraph>
        </Block>
    </StackLayout>,
];
