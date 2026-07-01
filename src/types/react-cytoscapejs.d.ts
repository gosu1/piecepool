declare module "react-cytoscapejs" {
  import type { ComponentType, CSSProperties } from "react";
  import type { Core, ElementDefinition } from "cytoscape";

  interface CytoscapeComponentProps {
    elements: ElementDefinition[];
    stylesheet?: unknown;
    layout?: unknown;
    cy?: (cy: Core) => void;
    style?: CSSProperties;
    className?: string;
    minZoom?: number;
    maxZoom?: number;
    wheelSensitivity?: number;
    [k: string]: unknown;
  }

  const CytoscapeComponent: ComponentType<CytoscapeComponentProps> & {
    normalizeElements: (data: unknown) => ElementDefinition[];
  };
  export default CytoscapeComponent;
}
