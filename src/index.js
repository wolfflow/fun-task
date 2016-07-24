// @flow

type Cancel = () => void
type Handler<T> = (x: T) => void
type Computation<S, F> = (handleSucc: (s: S) => void, handleFail: (f: F) => void) => ?Cancel

const defaultFailureHandler = failure => {
  throw new Error(failure)
}

const noop = () => {}

export default class Task<S, F> {

  constructor() {
    if (this.constructor === Task) {
      throw new Error('Don\'t call `new Task()`, call `Task.create()` instead')
    }
  }

  // Creates a task with an arbitrary computation
  static create<S, F>(computation: Computation<S, F>): Task<S, F> {
    return new FromComputation(computation)
  }

  // Creates a task that resolves with a given value
  static of<S, F>(value: S): Task<S, F> {
    return new Of(value)
  }

  // Creates a task that rejects with a given error
  static rejected<S, F>(error: F): Task<S, F> {
    // todo
    return (null: any)
  }

  // Creates a task that never completes
  static empty(): Task<any, any> {
    // todo
    return (null: any)
  }

  // Given array of tasks creates a task of array
  static all<S, F>(task: Array<Task<S, F>>): Task<S[], F> {
    // todo
    return (null: any)
  }

  // Given array of tasks creates a task that completes with the earliest value or error
  static race<S, F>(task: Array<Task<S, F>>): Task<S, F> {
    // todo
    return (null: any)
  }

  // Transforms a task by applying `fn` to the successful value
  map<S1>(fn: (x: S) => S1): Task<S1, F> {
    // todo
    return (null: any)
  }

  // Transforms a task by applying `fn` to the failure value
  mapRejected<F1>(fn: (x: F) => F1): Task<S, F1> {
    // todo
    return (null: any)
  }

  // Transforms a task by applying `fn` to the successful value (where `fn` returns a Task)
  chain<S1, F1>(fn: (x: S) => Task<S1, F1>): Task<S1, F | F1> {
    // todo
    return (null: any)
  }

  // Transforms a task by applying `fn` to the failure value (where `fn` returns a Task)
  orElse<S1, F1>(fn: (x: F) => Task<S1, F1>): Task<S | S1, F1> {
    // todo
    return (null: any)
  }

  // Applies the successful value of task `withF` to to the successful value of task `withX`
  ap<F1>(otherTask: Task<any, F1>): Task<any, F | F1> {
    // todo
    return (null: any)
  }

  // Selects the earlier of the two tasks
  concat<S1, F1>(otherTask: Task<S1, F1>): Task<S | S1, F | F1> {
    // todo
    return (null: any)
  }

  run(handleSucc: Handler<S>, handleFail?: Handler<F>): Cancel {
    throw new Error('Method run() is not implemented in basic Task class.')
  }

}

class FromComputation<S, F> extends Task<S, F> {

  _computation: Computation<S, F>;

  constructor(computation: Computation<S, F>) {
    super()
    this._computation = computation
  }

  run(handleSucc: Handler<S>, handleFail: Handler<F> = defaultFailureHandler): Cancel {
    let succ = handleSucc
    let fail = handleFail
    let cancel = noop
    let closed = false
    let close = () => {
      succ = noop
      fail = noop
      cancel = noop
      close = noop
      closed = true
    }
    const _cancel = this._computation(x => { succ(x); close() }, x => { fail(x); close() })
    if (!closed) {
      cancel = _cancel || noop
    }
    return () => { cancel(); close() }
  }

}

class Of<S, F> extends Task<S, F> {

  _value: S;

  constructor(value: S) {
    super()
    this._value = value
  }

  run(handleSucc: Handler<S>): Cancel {
    handleSucc(this._value)
    return noop
  }

}
