/**
 * rimltools root lint plugin (scripts/ and packages/).
 *
 * A copy of products/qrcc/tools/oxlint-plugin-qrcc under the `rimltools/`
 * prefix, so root code follows the same rules as the products. See
 * `products/qrcc/.claude/skills/qrcc-typescript/SKILL.md` for the rationale.
 */

/** @param {import('estree').Node} node */
const isAsConst = (node) =>
  node.typeAnnotation?.type === 'TSTypeReference'
  && node.typeAnnotation.typeName?.type === 'Identifier'
  && node.typeAnnotation.typeName.name === 'const'

const noClass = {
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
    const report = (node) => context.report({ node, messageId: 'noClass' })
    return {
      ClassDeclaration: report,
      ClassExpression: report,
      TSAbstractClassDeclaration: report,
    }
  },
}

const noTypeAssertion = {
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

const noEnum = {
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

const noThrowInDomain = {
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

export default {
  meta: { name: 'rimltools' },
  rules: {
    'no-class': noClass,
    'no-type-assertion': noTypeAssertion,
    'no-enum': noEnum,
    'no-throw-in-domain': noThrowInDomain,
  },
}
