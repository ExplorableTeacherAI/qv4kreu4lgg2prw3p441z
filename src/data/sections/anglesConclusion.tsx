/**
 * Section 5 — Wrapping Up (text only)
 * Keeps the promise the opening made, names the idea worth carrying away.
 */

import { type ReactElement } from "react";
import { StackLayout } from "@/components/layouts";
import { Block } from "@/components/templates";
import { EditableH2, EditableParagraph } from "@/components/atoms";

export const anglesConclusionBlocks: ReactElement[] = [
    <StackLayout key="layout-conclusion-heading" maxWidth="xl">
        <Block id="conclusion-heading" padding="md">
            <EditableH2 id="h2-conclusion-heading" blockId="conclusion-heading">
                Wrapping Up
            </EditableH2>
        </Block>
    </StackLayout>,

    <StackLayout key="layout-conclusion-recap" maxWidth="xl">
        <Block id="conclusion-recap" padding="sm">
            <EditableParagraph id="para-conclusion-recap" blockId="conclusion-recap">
                So the angle sum was never about how big a shape is or how stretched it
                looks. Cut it into triangles from one corner, count them, multiply by
                180. A ten-sided shape gives eight triangles and 1440 degrees, and you
                never picked up a protractor.
            </EditableParagraph>
        </Block>
    </StackLayout>,

    <StackLayout key="layout-conclusion-next" maxWidth="xl">
        <Block id="conclusion-next" padding="sm">
            <EditableParagraph id="para-conclusion-next" blockId="conclusion-next">
                That is why the hexagons on a football sit so neatly against each other,
                and why bathroom tiles and honeycombs settle into the patterns they do.
                Next comes the question of what happens when all the angles in a shape
                are equal, which turns this total into a single angle you can name.
            </EditableParagraph>
        </Block>
    </StackLayout>,
];
