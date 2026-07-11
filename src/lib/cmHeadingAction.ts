import { EditorView, Decoration, WidgetType, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

// ══ 헤딩 줄 호버 액션 — Notion 의 블록 핸들과 같은 결 ══
//
// ##/### 제목 줄에 마우스를 올리면 제목 끝에 작은 버튼이 나타난다. 한 번 누르면 끝.
// 드래그해서 고르라고 하면 "무언가 하려면 먼저 선택부터 해야 한다" 는 부담을 지운다 —
// 섹션은 이미 사용자가 나눠 놓은 경계이므로, 그 경계를 가리키기만 하면 된다.
//
// 코드 펜스 안의 `##` 은 lezer 구문 트리가 헤딩으로 보지 않으므로 자동으로 걸러진다.

export interface HeadingAction {
  label: string;
  /** pos = 헤딩 줄 시작 오프셋, doc = 그 오프셋의 기준 문서(CRLF 어긋남 방지) */
  run: (p: { pos: number; doc: string }) => void;
}

class HandleWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly onClick: () => void,
  ) {
    super();
  }
  eq(other: HandleWidget) {
    return other.label === this.label;
  }
  toDOM() {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pp-heading-action";
    b.textContent = this.label;
    // 화면엔 짧게, 접근명은 분명하게 — 인박스의 "글 전체 파인만" 버튼과 헷갈리지 않는다.
    b.setAttribute("aria-label", `이 섹션 ${this.label}`);
    // mousedown 을 막지 않으면 에디터가 포커스를 가져가며 커서를 옮긴다(클릭 전에 사라짐).
    b.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onClick();
    };
    return b;
  }
  ignoreEvent() {
    return true; // 위젯 안의 이벤트는 에디터가 건드리지 않는다
  }
}

/** getAction 이 undefined 를 주면 아무 핸들도 그리지 않는다(파인만이 붙지 않은 에디터). */
export function headingAction(getAction: () => HeadingAction | undefined) {
  const build = (view: EditorView): DecorationSet => {
    const action = getAction();
    const b = new RangeSetBuilder<Decoration>();
    if (!action) return b.finish();
    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from,
        to,
        enter: (n) => {
          if (n.name !== "ATXHeading2" && n.name !== "ATXHeading3") return;
          const pos = n.from;
          b.add(
            n.to,
            n.to,
            Decoration.widget({
              side: 1,
              widget: new HandleWidget(action.label, () =>
                getAction()?.run({ pos, doc: view.state.doc.toString() }),
              ),
            }),
          );
        },
      });
    }
    return b.finish();
  };

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
}
