from jinja2.runtime import LoopContext, Macro, Markup, Namespace, TemplateNotFound, TemplateReference, TemplateRuntimeError, Undefined, escape, identity, internalcode, markup_join, missing, str_join
name = 'components/button/goto.jinja'

def root(context, missing=missing):
    resolve = context.resolve_or_missing
    undefined = environment.undefined
    concat = environment.concat
    cond_expr_undefined = Undefined
    if 0: yield None
    l_0_href = resolve('href')
    pass
    yield '<a\n  href="'
    yield escape((undefined(name='href') if l_0_href is missing else l_0_href))
    yield '"\n  class="action_button"\n  data-turbo="false"\n  data-testid="modal-go-to-document-action"\n>'
    template = environment.get_template('icons/ico16_go_to_doc_r.svg', 'components/button/goto.jinja')
    gen = template.root_render_func(template.new_context(context.get_all(), True, {}))
    try:
        for event in gen:
            yield event
    finally: gen.close()
    yield ' Find in the document view</a>'

blocks = {}
debug_info = '2=13&6=15'