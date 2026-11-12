import { React } from '../../ui/react/runtime';
import { createReactView } from '../../ui/react/view';
import type { ReactView } from '../../ui/react/types';
import type { AnnotationCommentReactCommand, AnnotationCommentReactModel } from './react-model';

export const ANNOTATION_COMMENT_REACT_CSS = `
.neo-annotation-comment { display:flex; flex-direction:column; font:13px/1.4 sans-serif; }
.neo-annotation-comment .excerpt { padding:8px 12px; color:var(--zotero-neo-muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; background:var(--zotero-neo-elevated); }
.neo-annotation-comment textarea { width:100%; box-sizing:border-box; min-height:72px; max-height:220px; padding:10px 12px; background:var(--zotero-neo-input); color:var(--zotero-neo-text); border:0; outline:2px solid var(--zotero-neo-focus-ring); outline-offset:-2px; resize:none; font:13px/1.5 sans-serif; }
.neo-annotation-comment .hint { padding:5px 12px; border-top:1px solid var(--zotero-neo-border); color:var(--zotero-neo-muted); font-size:11px; }
`;

export function mountAnnotationCommentReactView(
  root: HTMLElement,
  initialModel: AnnotationCommentReactModel,
  _dispatch: (command: AnnotationCommentReactCommand) => void,
): ReactView<AnnotationCommentReactModel> {
  return createReactView(
    root,
    (model) => (
      <div className="neo-annotation-comment">
        {model.excerpt && <div className="excerpt">{model.excerpt}</div>}
        <textarea
          id="zv-annotation-comment-input"
          data-neo-ui-part="input"
          defaultValue={model.comment}
          spellCheck={false}
        />
        <div className="hint">{model.hint}</div>
      </div>
    ),
    initialModel,
  );
}
