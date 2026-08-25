/**
 * Section 2 — Every Triangle Adds Up to the Same Thing
 *
 * Bespoke figure: a triangle with a draggable apex. The three corner angles are
 * copied into a fan below the shape, where they always fill exactly a half-turn.
 * Drag anywhere, and the fan still closes on the straight line.
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
import { clamp, useSpring, type Vec2 } from "@/lib/motion";
import {
    clozePropsFromDefinition,
    getVariableInfo,
    linkedHighlightPropsFromDefinition,
} from "../variables";

// ── View constants ───────────────────────────────────────────────────────────

const VIEW_WIDTH = 560;
const VIEW_HEIGHT = 470;

const BASE_Y = 250;
const LEFT_CORNER: Vec2 = { x: 100, y: BASE_Y };
const RIGHT_CORNER: Vec2 = { x: 460, y: BASE_Y };

const APEX_MIN_X = 70;
const APEX_MAX_X = 430;
const APEX_MIN_Y = 66;
const APEX_MAX_Y = 206;
const DEFAULT_APEX_X = 246;
const DEFAULT_APEX_Y = 92;

const FAN_CENTRE: Vec2 = { x: 280, y: 400 };
const FAN_RADIUS = 84;
const FAN_LINE_LEFT = 120;
const FAN_LINE_RIGHT = 440;

const INK = "#334155";
const INK_STRUCTURE = "#64748B";
const INK_QUIET = "#CBD5E1";

const APEX_COLOR = "#62D0AD"; // the draggable corner
const LEFT_COLOR = "#8E90F5";
const RIGHT_COLOR = "#AC8BF9";

const EASE_150 = { transition: "opacity 150ms ease, stroke-width 150ms ease" } as const;

// ── Geometry helpers ─────────────────────────────────────────────────────────

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Standard-orientation direction (degrees) of the vector from `from` to `to`. */
const directionDegrees = (from: Vec2, to: Vec2) =>
    toDegrees(Math.atan2(from.y - to.y, to.x - from.x));

/** Wrap to (-180, 180]. */
const wrapSigned = (degrees: number) => (((degrees + 180) % 360) + 360) % 360 - 180;

const pointOnCircle = (centre: Vec2, radius: number, degrees: number): Vec2 => ({
    x: centre.x + radius * Math.cos((degrees * Math.PI) / 180),
    y: centre.y - radius * Math.sin((degrees * Math.PI) / 180),
});

/** Filled sector from angle `start` sweeping to `end` (both standard degrees). */
const sectorPath = (centre: Vec2, radius: number, start: number, end: number) => {
    const from = pointOnCircle(centre, radius, start);
    const to = pointOnCircle(centre, radius, end);
    const largeArc = Math.abs(end - start) > 180 ? 1 : 0;
    const sweep = end > start ? 0 : 1; // y-down: counterclockwise on screen is 0
    return `M ${centre.x} ${centre.y} L ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${to.x} ${to.y} Z`;
};

const interiorAngle = (vertex: Vec2, first: Vec2, second: Vec2) => {
    const startAngle = directionDegrees(vertex, first);
    const signedSweep = wrapSigned(directionDegrees(vertex, second) - startAngle);
    return { startAngle, signedSweep, size: Math.abs(signedSweep) };
};

const formatAngle = (degrees: number) => `${Math.round(degrees)}°`;

// ── Shared highlight contract ────────────────────────────────────────────────

const useHighlightState = () => {
    const highlight = useVar<string>("triangleHighlight", "");
    const setVar = useSetVar();
    return {
        opacity: (id: string) => (highlight && highlight !== id ? 0.35 : 1),
        weight: (id: string, resting: number) => (highlight === id ? resting * 1.6 : resting),
        isActive: (id: string) => highlight === id,
        hoverProps: (id: string) => ({
            onPointerEnter: () => setVar("triangleHighlight", id),
            onPointerLeave: () => setVar("triangleHighlight", ""),
        }),
    };
};

const Halo = ({ active, children }: { active: boolean; children: React.ReactNode }) =>
    active ? <g opacity={0.28}>{children}</g> : null;

// ── The drawing ──────────────────────────────────────────────────────────────

function TriangleAngleSumDrawing() {
    const setVar = useSetVar();
    const apexX = useVar<number>("triangleApexX", DEFAULT_APEX_X);
    const apexY = useVar<number>("triangleApexY", DEFAULT_APEX_Y);
    const { opacity, weight, isActive, hoverProps } = useHighlightState();

    const [dragging, setDragging] = useState(false);
    const [hovered, setHovered] = useState(false);
    const draggingRef = useRef(false);
    const svgRef = useRef<SVGSVGElement>(null);
    const handleScale = useSpring(dragging || hovered ? 1.15 : 1, {
        stiffness: 400,
        damping: 26,
    });

    const apex: Vec2 = { x: apexX, y: apexY };

    const handlePointerMove = (event: React.PointerEvent<SVGCircleElement>) => {
        if (!draggingRef.current || !svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH;
        const y = ((event.clientY - rect.top) / rect.height) * VIEW_HEIGHT;
        setVar("triangleApexX", clamp(x, APEX_MIN_X, APEX_MAX_X));
        setVar("triangleApexY", clamp(y, APEX_MIN_Y, APEX_MAX_Y));
    };

    // The model draws the view: every angle comes from the three corner positions.
    const apexAngle = interiorAngle(apex, LEFT_CORNER, RIGHT_CORNER);
    const leftAngle = interiorAngle(LEFT_CORNER, RIGHT_CORNER, apex);
    const rightAngle = interiorAngle(RIGHT_CORNER, apex, LEFT_CORNER);

    // Rounded readouts that always total 180 (the third absorbs the rounding).
    const shownApex = Math.round(apexAngle.size);
    const shownLeft = Math.round(leftAngle.size);
    const shownRight = 180 - shownApex - shownLeft;

    const sideLength = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
    const wedgeRadius = (vertex: Vec2, a: Vec2, b: Vec2) =>
        Math.min(36, 0.34 * Math.min(sideLength(vertex, a), sideLength(vertex, b)));

    const corners = [
        {
            id: "apex",
            colour: APEX_COLOR,
            vertex: apex,
            angle: apexAngle,
            radius: wedgeRadius(apex, LEFT_CORNER, RIGHT_CORNER),
            shown: shownApex,
        },
        {
            id: "left",
            colour: LEFT_COLOR,
            vertex: LEFT_CORNER,
            angle: leftAngle,
            radius: wedgeRadius(LEFT_CORNER, RIGHT_CORNER, apex),
            shown: shownLeft,
        },
        {
            id: "right",
            colour: RIGHT_COLOR,
            vertex: RIGHT_CORNER,
            angle: rightAngle,
            radius: wedgeRadius(RIGHT_CORNER, apex, LEFT_CORNER),
            shown: shownRight,
        },
    ];

    // The same three angles, laid end to end on a straight line.
    let fanCursor = 180;
    const fanWedges = [leftAngle.size, apexAngle.size, rightAngle.size].map((size, index) => {
        const start = fanCursor;
        const end = fanCursor - size;
        fanCursor = end;
        return {
            colour: [LEFT_COLOR, APEX_COLOR, RIGHT_COLOR][index],
            path: sectorPath(FAN_CENTRE, FAN_RADIUS, start, end),
            labelPoint: pointOnCircle(FAN_CENTRE, FAN_RADIUS * 0.62, (start + end) / 2),
            shown: [shownLeft, shownApex, shownRight][index],
        };
    });

    // Label placement: nudged toward the middle of the triangle so text never
    // sits on top of an edge.
    const centroid: Vec2 = {
        x: (apex.x + LEFT_CORNER.x + RIGHT_CORNER.x) / 3,
        y: (apex.y + LEFT_CORNER.y + RIGHT_CORNER.y) / 3,
    };
    const labelPosition = (vertex: Vec2) => {
        const dx = centroid.x - vertex.x;
        const dy = centroid.y - vertex.y;
        const length = Math.hypot(dx, dy) || 1;
        return { x: vertex.x + (dx / length) * 52, y: vertex.y + (dy / length) * 52 + 4 };
    };

    return (
        <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            className="block w-full select-none"
            role="img"
            aria-label="A triangle with a draggable top corner, and its three angles laid end to end on a straight line"
        >
            <defs>
                <filter id="triangle-apex-shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#0F172A" floodOpacity="0.25" />
                </filter>
            </defs>

            {/* Running total — one formatter, tabular numerals, never jitters. */}
            <text
                x={VIEW_WIDTH / 2}
                y="36"
                textAnchor="middle"
                fontSize="14"
                style={{ fontVariantNumeric: "tabular-nums", ...EASE_150 }}
                opacity={opacity("angles")}
            >
                <tspan fill={LEFT_COLOR}>{formatAngle(shownLeft)}</tspan>
                <tspan fill={INK}> + </tspan>
                <tspan fill={APEX_COLOR}>{formatAngle(shownApex)}</tspan>
                <tspan fill={INK}> + </tspan>
                <tspan fill={RIGHT_COLOR}>{formatAngle(shownRight)}</tspan>
                <tspan fill={INK} fontWeight="600">{`  =  ${formatAngle(180)}`}</tspan>
            </text>

            {/* Ghost of the starting triangle — the before-state reference. */}
            <g opacity={opacity("__structure")} style={EASE_150}>
                <polygon
                    points={`${DEFAULT_APEX_X},${DEFAULT_APEX_Y} ${LEFT_CORNER.x},${LEFT_CORNER.y} ${RIGHT_CORNER.x},${RIGHT_CORNER.y}`}
                    fill="none"
                    stroke={INK_QUIET}
                    strokeWidth="1.5"
                    strokeDasharray="4 5"
                />
            </g>

            {/* The triangle itself — structure weight. */}
            <g opacity={opacity("__structure")} style={EASE_150}>
                <polygon
                    points={`${apex.x},${apex.y} ${LEFT_CORNER.x},${LEFT_CORNER.y} ${RIGHT_CORNER.x},${RIGHT_CORNER.y}`}
                    fill="#F8FAFC"
                    stroke={INK_STRUCTURE}
                    strokeWidth="2"
                    strokeLinejoin="round"
                />
            </g>

            {/* The three corner angles — one group, one highlight id. */}
            <g {...hoverProps("angles")} opacity={opacity("angles")} style={EASE_150}>
                {corners.map((corner) => (
                    <g key={corner.id}>
                        <Halo active={isActive("angles")}>
                            <path
                                d={sectorPath(
                                    corner.vertex,
                                    corner.radius,
                                    corner.angle.startAngle,
                                    corner.angle.startAngle + corner.angle.signedSweep,
                                )}
                                fill={corner.colour}
                                stroke={corner.colour}
                                strokeWidth="7"
                                strokeLinejoin="round"
                            />
                        </Halo>
                        <path
                            d={sectorPath(
                                corner.vertex,
                                corner.radius,
                                corner.angle.startAngle,
                                corner.angle.startAngle + corner.angle.signedSweep,
                            )}
                            fill={corner.colour}
                            fillOpacity={isActive("angles") ? 0.4 : 0.2}
                            stroke={corner.colour}
                            strokeWidth={weight("angles", 2.5)}
                            strokeLinejoin="round"
                        />
                        <text
                            x={labelPosition(corner.vertex).x}
                            y={labelPosition(corner.vertex).y}
                            fill={corner.colour}
                            fontSize="13"
                            textAnchor="middle"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                            {formatAngle(corner.shown)}
                        </text>
                    </g>
                ))}
            </g>

            {/* Fixed corners — ink, deliberately not grabbable-looking. */}
            <g opacity={opacity("__structure")} style={EASE_150}>
                <circle cx={LEFT_CORNER.x} cy={LEFT_CORNER.y} r="5" fill={INK_STRUCTURE} />
                <circle cx={RIGHT_CORNER.x} cy={RIGHT_CORNER.y} r="5" fill={INK_STRUCTURE} />
            </g>

            {/* The straight line the three angles have to fill. */}
            <g {...hoverProps("straight")} opacity={opacity("straight")} style={EASE_150}>
                <Halo active={isActive("straight")}>
                    <line
                        x1={FAN_LINE_LEFT}
                        y1={FAN_CENTRE.y}
                        x2={FAN_LINE_RIGHT}
                        y2={FAN_CENTRE.y}
                        stroke={INK_STRUCTURE}
                        strokeWidth={weight("straight", 2) + 6}
                        strokeLinecap="round"
                    />
                </Halo>
                <path
                    d={`M ${FAN_CENTRE.x - FAN_RADIUS} ${FAN_CENTRE.y} A ${FAN_RADIUS} ${FAN_RADIUS} 0 0 1 ${FAN_CENTRE.x + FAN_RADIUS} ${FAN_CENTRE.y}`}
                    fill="none"
                    stroke={INK_QUIET}
                    strokeWidth="1.5"
                    strokeDasharray="4 5"
                />
                <line
                    x1={FAN_LINE_LEFT}
                    y1={FAN_CENTRE.y}
                    x2={FAN_LINE_RIGHT}
                    y2={FAN_CENTRE.y}
                    stroke={INK_STRUCTURE}
                    strokeWidth={weight("straight", 2)}
                    strokeLinecap="round"
                />
                <text
                    x={FAN_CENTRE.x}
                    y={FAN_CENTRE.y + 30}
                    fill={INK}
                    fontSize="12"
                    textAnchor="middle"
                >
                    a straight line, half a full turn
                </text>
            </g>

            {/* The same three angles, moved onto that line. */}
            <g {...hoverProps("angles")} opacity={opacity("angles")} style={EASE_150}>
                {fanWedges.map((wedge, index) => (
                    <g key={index}>
                        <path
                            d={wedge.path}
                            fill={wedge.colour}
                            fillOpacity={isActive("angles") ? 0.4 : 0.2}
                            stroke={wedge.colour}
                            strokeWidth={weight("angles", 2.5)}
                            strokeLinejoin="round"
                        />
                        {wedge.shown >= 14 && (
                            <text
                                x={wedge.labelPoint.x}
                                y={wedge.labelPoint.y + 4}
                                fill={wedge.colour}
                                fontSize="12"
                                textAnchor="middle"
                                style={{ fontVariantNumeric: "tabular-nums" }}
                            >
                                {formatAngle(wedge.shown)}
                            </text>
                        )}
                    </g>
                ))}
            </g>

            {/* The draggable corner. */}
            <g transform={`translate(${apex.x} ${apex.y}) scale(${handleScale})`}>
                <circle r="9" fill={APEX_COLOR} filter="url(#triangle-apex-shadow)" />
            </g>
            <circle
                cx={apex.x}
                cy={apex.y}
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

function TriangleAngleSumFigure() {
    const setVar = useSetVar();
    return (
        <Figure
            id="triangle-angle-sum"
            onReset={() => {
                setVar("triangleApexX", DEFAULT_APEX_X);
                setVar("triangleApexY", DEFAULT_APEX_Y);
                setVar("triangleHighlight", "");
            }}
            caption="Drag the teal corner. The three angles are copied onto the straight line below, and they always close it exactly."
        >
            <TriangleAngleSumDrawing />
            <InteractionHintSequence
                hintKey="triangle-apex-drag"
                steps={[
                    {
                        gesture: "drag",
                        label: "Drag the teal corner anywhere",
                        position: { x: "44%", y: "26%" },
                        dragPath: {
                            type: "line",
                            startOffset: { x: -30, y: -12 },
                            endOffset: { x: 34, y: 16 },
                        },
                    },
                ]}
            />
        </Figure>
    );
}

// ── Blocks ───────────────────────────────────────────────────────────────────

export const triangleAngleSumBlocks: ReactElement[] = [
    <StackLayout key="layout-triangle-heading" maxWidth="xl">
        <Block id="triangle-heading" padding="md">
            <EditableH2 id="h2-triangle-heading" blockId="triangle-heading">
                Every Triangle Adds Up to the Same Thing
            </EditableH2>
        </Block>
    </StackLayout>,

    <StackLayout key="layout-triangle-setup" maxWidth="xl">
        <Block id="triangle-setup" padding="sm">
            <EditableParagraph id="para-triangle-setup" blockId="triangle-setup">
                Start with the simplest straight-sided shape there is. Drag the teal
                corner anywhere you like, and watch the{" "}
                <InlineLinkedHighlight
                    varName="triangleHighlight"
                    highlightId="angles"
                    {...linkedHighlightPropsFromDefinition(getVariableInfo("triangleHighlight"))}
                >
                    three corner angles
                </InlineLinkedHighlight>{" "}
                slide down onto the{" "}
                <InlineLinkedHighlight
                    varName="triangleHighlight"
                    highlightId="straight"
                    {...linkedHighlightPropsFromDefinition(getVariableInfo("triangleHighlight"))}
                >
                    straight line
                </InlineLinkedHighlight>{" "}
                below. Stretch it tall, squash it flat, push it lopsided.
            </EditableParagraph>
        </Block>
    </StackLayout>,

    <StackLayout key="layout-triangle-figure" maxWidth="xl">
        <Block id="triangle-figure" padding="sm" hasVisualization>
            <TriangleAngleSumFigure />
        </Block>
    </StackLayout>,

    <StackLayout key="layout-triangle-insight" maxWidth="xl">
        <Block id="triangle-insight" padding="sm">
            <EditableParagraph id="para-triangle-insight" blockId="triangle-insight">
                Half a turn is 180 degrees, so the three angles of any triangle add to
                180. That single fact is the engine for everything else on this page.
                Once you know two of the angles, the third has nowhere to hide.
            </EditableParagraph>
        </Block>
    </StackLayout>,

    <StackLayout key="layout-triangle-question" maxWidth="xl">
        <Block id="triangle-question" padding="sm">
            <EditableParagraph id="para-triangle-question" blockId="triangle-question">
                A triangle in a bike frame has two angles measuring 47° and 68°, so its
                third angle must be{" "}
                <InlineFeedback
                    varName="answerTriangleMissingAngle"
                    correctValue={["65", "65°"]}
                    position="terminal"
                    successMessage="— spot on, 47 and 68 make 115, and 180 leaves 65 behind"
                    failureMessage="— not yet."
                    hint="Add the two angles you were given, then see how much of the 180 is left"
                    reviewBlockId="triangle-figure"
                    reviewLabel="Back to the triangle"
                >
                    <InlineClozeInput
                        varName="answerTriangleMissingAngle"
                        correctAnswer={["65", "65°"]}
                        {...clozePropsFromDefinition(getVariableInfo("answerTriangleMissingAngle"))}
                    />
                </InlineFeedback>{" "}
                degrees.
            </EditableParagraph>
        </Block>
    </StackLayout>,
];
