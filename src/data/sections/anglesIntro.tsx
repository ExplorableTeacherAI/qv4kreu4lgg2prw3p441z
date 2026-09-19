/**
 * Section 1 — Angles in Triangles and Polygons (opening)
 * Text only: the hook, the promise, and the one skill it builds on.
 */

import { type ReactElement } from "react";
import { StackLayout } from "@/components/layouts";
import { Block } from "@/components/templates";
import {
    EditableH1,
    EditableParagraph,
    InlineSpotColor,
    InlineTooltip,
} from "@/components/atoms";
import { getVariableInfo, spotColorPropsFromDefinition } from "../variables";

export const anglesIntroBlocks: ReactElement[] = [
    <StackLayout key="layout-intro-title" maxWidth="xl">
        <Block id="intro-title" padding="md">
            <EditableH1 id="h1-intro-title" blockId="intro-title">
                Angles in Triangles and Polygons
            </EditableH1>
        </Block>
    </StackLayout>,

    <StackLayout key="layout-intro-football" maxWidth="xl">
        <Block id="intro-football" padding="sm">
            <EditableParagraph id="para-intro-football" blockId="intro-football">
                Pick up a football and look closely at the panels: black{" "}
                <InlineTooltip
                    id="tooltip-intro-pentagon"
                    tooltip="A pentagon is a flat shape with five straight sides."
                    color="#2563EB"
                    bgColor="rgba(37, 99, 235, 0.12)"
                >
                    pentagons
                </InlineTooltip>{" "}
                stitched between white{" "}
                <InlineTooltip
                    id="tooltip-intro-hexagon"
                    tooltip="A hexagon is a flat shape with six straight sides."
                    color="#2563EB"
                    bgColor="rgba(37, 99, 235, 0.12)"
                >
                    hexagons
                </InlineTooltip>
                . Every panel has corners, and every
                corner has an angle. Nobody stitching that ball measured them, yet the
                angles in each panel add to a total that was settled long before anyone
                picked up a needle.
            </EditableParagraph>
        </Block>
    </StackLayout>,

    <StackLayout key="layout-intro-promise" maxWidth="xl">
        <Block id="intro-promise" padding="sm">
            <EditableParagraph id="para-intro-promise" blockId="intro-promise">
                For any{" "}
                <InlineTooltip
                    id="tooltip-intro-polygon"
                    tooltip="A flat shape with straight sides is called a polygon. Triangles, squares and hexagons are all polygons."
                    color="#2563EB"
                    bgColor="rgba(37, 99, 235, 0.12)"
                >
                    flat shape with straight sides
                </InlineTooltip>
                , the corner angles always add to the{" "}
                <InlineSpotColor
                    id="spot-intro-total"
                    varName="angleSumTotal"
                    {...spotColorPropsFromDefinition(getVariableInfo("angleSumTotal"))}
                >
                    same total
                </InlineSpotColor>
                , and you can find it without measuring a single one. The
                trick is to cut the shape into{" "}
                <InlineSpotColor
                    id="spot-intro-triangles"
                    varName="triangleCount"
                    {...spotColorPropsFromDefinition(getVariableInfo("triangleCount"))}
                >
                    triangles
                </InlineSpotColor>{" "}
                and count them. By the end of
                this page you will be able to do that for any straight-sided shape,
                using nothing harder than multiplication.
            </EditableParagraph>
        </Block>
    </StackLayout>,
];
