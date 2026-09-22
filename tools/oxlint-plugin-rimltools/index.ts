/**
 * RimlTools lint plugin, shared by every product and by scripts/ and packages/.
 *
 * These rules make the team coding rules mechanically enforceable instead of
 * relying on reviewers (or an agent) remembering them. See
 * `.claude/skills/rimltools-typescript/SKILL.md` for the rationale.
 */

import type { RuleTester } from 'oxlint/plugins-dev'

/**
 * oxlint の規則の型。公開されている `RuleTester#run` の引数から取る（型だけを import するので
 * 実行時の依存は増えない。Node 26 はこのファイルを型を除いてそのまま読み込む）。
 */
type Rule = Parameters<RuleTester['run']>[1]

type TypeAnnotationLike = {
  readonly type: string
  readonly typeName?: { readonly type: string; readonly name?: string }
}

const isAsConst = (node: { readonly typeAnnotation: TypeAnnotationLike }): boolean =>
  node.typeAnnotation.type === 'TSTypeReference'
  && node.typeAnnotation.typeName?.type === 'Identifier'
  && node.typeAnnotation.typeName.name === 'const'

const noClass: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow classes. Model behaviour with functions and pass collaborators as arguments (function DI).',
    },
    messages: {
      noClass:
        'class is not allowed. Use a factory function returning an object of closures, and inject collaborators as parameters (DIP).',
    },
  },
  create(context) {
    return {
      ClassDeclaration(node) {
        context.report({ node, messageId: 'noClass' })
      },
      ClassExpression(node) {
        context.report({ node, messageId: 'noClass' })
      },
      TSAbstractClassDeclaration(node) {
        context.report({ node, messageId: 'noClass' })
      },
    }
  },
}

const noTypeAssertion: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow type assertions. Narrow with type guards / discriminated unions, or validate at the boundary.',
    },
    messages: {
      noAs: '`as` is not allowed (except `as const`). Narrow with a type guard, a discriminated union, or a parse function that returns Result.',
      noAngle: 'Angle-bracket type assertions are not allowed.',
      noNonNull: '`!` non-null assertion is not allowed. Handle the absent case explicitly.',
    },
  },
  create(context) {
    return {
      TSAsExpression(node) {
        if (isAsConst(node)) return
        context.report({ node, messageId: 'noAs' })
      },
      TSTypeAssertion(node) {
        context.report({ node, messageId: 'noAngle' })
      },
      TSNonNullExpression(node) {
        context.report({ node, messageId: 'noNonNull' })
      },
    }
  },
}

const noEnum: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow enum. Use a const object + union of its values, or a discriminated union.',
    },
    messages: {
      noEnum:
        'enum is not allowed. Use `const X = {...} as const` with `type X = (typeof X)[keyof typeof X]`, or a discriminated union.',
    },
  },
  create(context) {
    return {
      TSEnumDeclaration(node) {
        context.report({ node, messageId: 'noEnum' })
      },
    }
  },
}

const noThrowInDomain: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `throw` in domain code. Domain failures are values: return Result<T, E>.',
    },
    messages: {
      noThrow:
        '`throw` is not allowed here. Return `err(...)` from a Result-returning function so callers must handle the failure.',
    },
  },
  create(context) {
    return {
      ThrowStatement(node) {
        context.report({ node, messageId: 'noThrow' })
      },
    }
  },
}

const rules: Readonly<Record<string, Rule>> = {
  'no-class': noClass,
  'no-type-assertion': noTypeAssertion,
  'no-enum': noEnum,
  'no-throw-in-domain': noThrowInDomain,
}

export default {
  meta: { name: 'rimltools' },
  rules,
}
