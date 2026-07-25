import type { StylesheetStyle } from "cytoscape";
import { REVIEW_COLOR } from "./relationMeta";

// "이름표까지 노드로 취급": 이름표는 노드 하단(text-valign:bottom)에 붙으므로, 아래에서 올라오는
// 화살표만 이름표에 묻힌다. 그런 엣지는 화살촉을 이름표 높이만큼 내려(target-distance-from-node)
// 이름표 바로 아래에서 이름표를 가리키게 한다 — 위·옆 진입은 그대로 노드를 가리킨다.
// 값 = text-margin-y(3) + 라벨 박스 높이(≈font 7 + padding). 라벨 하단에 바짝(작은 간격만) 붙인다.
const LABEL_OFFSET = 12;

// 노드 지름은 우선도 비례 6~36px(CytoscapeGraph: size = 6 + priority*30). 두 링의 두께를 그 범위에
// 함께 매핑해 어느 크기에서도 같은 비율로 읽히게 한다. 고정폭이면 작은 노드는 링이 노드를 삼키고,
// 우선도로 커진 노드는 실오라기처럼 얇아져 대시가 톱니로 갈린다 — 정작 중요한 노드에서 신호가 죽는다.
//
// 채널 배치: 복습 = 바깥 링(outline), 선택 = 안쪽 링(border).
// cytoscape 는 outline 을 border **바깥**에 그린다. 복습은 선택보다 강한 신호(지금 공부할 것)이므로
// 바깥에 둬야 먼저 읽힌다 — 반대로 두면 파란 선택 링이 빨강을 감싸 복습 표시가 묻힌다.
const REVIEW_OUTLINE = "mapData(size, 6, 36, 1.5, 4.5)";
const SELECT_BORDER = "mapData(size, 6, 36, 1.5, 3)";

export interface GraphTokens {
  label: string;
  labelBg: string;
  core: string;
  result: string;
  edge: string;
  selection: string;
}

// DS 토큰 → cytoscape 색. 다크모드 전환 시 재조회.
export function readTokens(): GraphTokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    label: v("--ds-ink-2", "#615d59"),
    labelBg: v("--ds-canvas", "#ffffff"),
    core: v("--ds-primary", "#0075de"),
    result: v("--ds-ink-faint", "#b8b5ad"),
    edge: v("--ds-ink-faint", "#b8b5ad"), // 모노크롬 엣지 — 의미는 색이 아니라 모양·라벨이 나른다
    selection: v("--ds-primary", "#0075de"),
  };
}

/** 토큰 → cytoscape 스타일시트. 뒤 규칙이 앞 규칙을 덮으므로 순서가 곧 우선순위다. */
export function graphStylesheet(t: GraphTokens): StylesheetStyle[] {
  return [
    {
      selector: "node",
      style: {
        "background-color": t.result,
        label: "data(label)",
        "font-size": 7,
        color: t.label,
        "text-valign": "bottom",
        "text-margin-y": 3,
        "text-background-color": t.labelBg,
        "text-background-opacity": 0.75,
        "text-background-padding": "2px",
        width: "data(size)",
        height: "data(size)",
        "transition-property": "opacity",
        "transition-duration": 120,
        // 노드 드래그 시 뜨는 오버레이를 사각형 대신 원으로.
        "overlay-shape": "ellipse",
      },
    },
    { selector: 'node[kind = "core"]', style: { "background-color": t.core } },
    // 전체 과목 뷰: sbg(space 색)가 있으면 kind 색을 덮어쓴다.
    { selector: "node[sbg]", style: { "background-color": "data(sbg)" } },
    // 사용자가 "아직 모르겠어요" 로 표시한 개념 — 모노크롬의 유일한 예외(relationMeta.ts REVIEW_COLOR).
    // 채움(선택/중심)이 아니라 링을 쓴다. 링은 바깥(outline) — 선택(border)보다 밖에서 먼저 읽힌다.
    {
      selector: "node[review]",
      style: {
        "outline-width": REVIEW_OUTLINE,
        "outline-color": REVIEW_COLOR,
        "outline-style": "dashed",
        "outline-opacity": 0.95,
      },
    },
    // 이해 안개 — 상태 없음·hazy 는 흐리게(저불투명이 곧 저채도로 읽힌다), clear 는 기존 시각 그대로.
    // 색(kind/sbg)·크기(priority)·링(review/선택) 채널은 그대로 두고 불투명도 채널만 쓴다.
    // hover .faded(0.12, 마지막 규칙)가 이보다 낮아 이웃 강조는 안개 위에서도 그대로 동작한다.
    { selector: "node[hazy]", style: { opacity: 0.35 } },
    // 배경 잡고 팬할 때 뜨는 회색 원(core active-bg) 제거.
    { selector: "core", style: { "active-bg-opacity": 0 } },
    {
      selector: "edge",
      style: {
        // 모노크롬: 의미는 색이 아니라 모양(실선/점선·화살표 유무)과 한국어 라벨이 나른다.
        "line-color": t.edge,
        width: "data(w)",
        "curve-style": "bezier",
        "target-arrow-shape": "triangle",
        "target-arrow-color": t.edge,
        "arrow-scale": 0.8,
        opacity: 0.7,
        // 한국어 관계 라벨 — 평소 숨김(text-opacity 0), 확대(.zoomed)·이웃 hover(.hl)·선택 시 노출
        label: "data(label)",
        "font-size": 7,
        color: t.label,
        "text-rotation": "autorotate",
        "text-background-color": t.labelBg,
        "text-background-opacity": 0.75,
        "text-background-padding": "1px",
        "text-opacity": 0,
        "transition-property": "opacity",
        "transition-duration": 120,
      },
    },
    // 논리 그룹별 모양 (relationMeta 분류): 대칭(연관)은 방향이 없으니 화살표 제거, 출처는 배경으로,
    // 복습만 유일한 색. 실선=뼈대(구조·순서·인과·활용)는 base 그대로.
    { selector: 'edge[grp = "assoc"]', style: { "line-style": "dashed", "target-arrow-shape": "none" } },
    { selector: 'edge[grp = "prov"]', style: { "line-style": "dashed", opacity: 0.4 } },
    { selector: 'edge[grp = "review"]', style: { "line-style": "dashed", "target-arrow-shape": "none", "line-color": REVIEW_COLOR, opacity: 0.9 } },
    // 이름표까지 노드로: 아래-진입 엣지는 화살촉을 이름표 아래로 내려 이름표를 가리키게 한다.
    { selector: "edge.to-label", style: { "target-distance-from-node": LABEL_OFFSET } },
    { selector: "edge.zoomed, edge.hl", style: { "text-opacity": 1 } },
    // 선택은 안쪽 링(border) — 복습 outline 이 이 바깥을 감싼다. 두께는 크기 비례(고정 3px 이면
    // 6px 노드를 삼킨다). 복습(outline)과 채널이 달라 서로 덮지 않으므로 node[review]:selected
    // 특례가 필요 없다 — 복습 노드를 고르면 빨강(밖) + 파랑(안)이 그대로 함께 보인다.
    { selector: "node:selected", style: { "border-width": SELECT_BORDER, "border-color": t.selection } },
    { selector: "edge:selected", style: { opacity: 1, width: 4, "text-opacity": 1 } },
    { selector: ".faded", style: { opacity: 0.12 } },
  ] as StylesheetStyle[];
}
