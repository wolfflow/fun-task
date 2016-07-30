// @flow

type Cancel = () => void
type Handler<-T> = (x: T) => void
type Handlers<-S, -F> = {
  success: Handler<S>,
  failure: Handler<F>,
  catch?: Handler<any>,
}
type LooseHandlers<-S, -F> = Handler<S> | {
  success?: Handler<S>,
  failure?: Handler<F>,
  catch?: Handler<any>,
}
type Computation<+S, +F> = (handleSucc: Handler<S>, handleFail: Handler<F>) => ?Cancel

const defaultFailureHandler = failure => {
  if (failure instanceof Error) {
    throw failure
  } else {
    throw new Error(String(failure))
  }
}
const noop = () => {}
const noopHandlers: Handlers<any, any> = {
  success: noop,
  failure: noop,
}

const safeRun = <S, F>(
  computation: (succ: (s: S) => void, fail: (f: F) => void) => ?(Cancel | {cancel?: Cancel, onClose: Cancel}),
  _handlers: Handlers<S, F>,
): Cancel => {
  let handlers = _handlers
  let cancel = noop
  let onClose = noop
  let closed = false
  let close = () => {
    onClose()
    closed = true
    // The idea here is to kill links to all stuff that we exposed from safeRun closure.
    // We expose via the return value (cancelation function) and by passing callbacks to the computation.
    // We reason from an assumption that outer code may keep links to values that we exposed forever.
    // So we look at all thing that referenced in the exposed callback and kill them.
    handlers = noopHandlers
    cancel = noop
    close = noop
  }
  const computationReturn = computation(
    x => { handlers.success(x); close() },
    x => { handlers.failure(x); close() }
  )
  if (computationReturn) {
    if (typeof computationReturn === 'function') {
      cancel = computationReturn
    } else {
      // this is called only when user cancels
      cancel = computationReturn.cancel || noop
      // this is called when user cancels plus when succ/fail are called
      onClose = computationReturn.onClose
    }
  }
  if (closed) {
    cancel = noop
    onClose()
  }
  return () => { cancel(); close() }
}

type SafeRunBody<S, F> = (s: Handler<S>, f: Handler<F>, c?: Handler<any>) => {
  onCancel?: Cancel, // called only when user cancels
  onClose?: Cancel, // called when user cancels plus when succ/fail/catch are called
}
const safeRun2 = <S, F>(body: SafeRunBody<S, F>, handlers: Handlers<S, F>): Cancel => {
  let {success, failure, catch: catch_} = handlers
  let onCancel = noop
  let onClose = noop
  let closed = false
  let close = () => {
    onClose()
    closed = true
    // The idea here is to kill links to all stuff that we exposed from safeRun closure.
    // We expose via the return value (cancelation function) and by passing callbacks to the computation.
    // We reason from an assumption that outer code may keep links to values that we exposed forever.
    // So we look at all thing that referenced in the exposed callback and kill them.
    success = noop
    failure = noop
    catch_ = catch_ && noop
    onCancel = noop
    close = noop
  }
  const bodyReturn = body(
    x => { success(x); close() },
    x => { failure(x); close() },
    catch_ && (x => { (catch_: any)(x); close() })
  )
  onCancel = bodyReturn.onCancel || noop
  onClose = bodyReturn.onClose || noop
  if (closed) {
    onCancel = noop
    onClose()
  }
  return () => { onCancel(); close() }
}



export default class Task<+S, +F> {

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
  // instance alias for Fantasy Land
  of<S, F>(value: S): Task<S, F> {
    return Task.of(value)
  }

  // Creates a task that rejects with a given error
  static rejected<S, F>(error: F): Task<S, F> {
    return new Rejected(error)
  }

  // Creates a task that never completes
  static empty(): Task<any, any> {
    return new Empty()
  }
  // instance alias for Fantasy Land
  empty(): Task<any, any> {
    return Task.empty()
  }

  // Given array of tasks creates a task of array
  static all<S, F>(tasks: Array<Task<S, F>>): Task<S[], F> {
    return new All(tasks)
  }

  // Given array of tasks creates a task that completes with the earliest value or error
  static race<S, F>(task: Array<Task<S, F>>): Task<S, F> {
    return new Race(task)
  }

  // Transforms a task by applying `fn` to the successful value
  map<S1>(fn: (x: S) => S1): Task<S1, F> {
    return new Map(this, fn)
  }

  // Transforms a task by applying `fn` to the failure value
  mapRejected<F1>(fn: (x: F) => F1): Task<S, F1> {
    return new MapRejected(this, fn)
  }

  // Transforms a task by applying `fn` to the successful value (where `fn` returns a Task)
  chain<S1, F1>(fn: (x: S) => Task<S1, F1>): Task<S1, F | F1> {
    return new Chain(this, fn)
  }

  // Transforms a task by applying `fn` to the failure value (where `fn` returns a Task)
  orElse<S1, F1>(fn: (x: F) => Task<S1, F1>): Task<S | S1, F1> {
    return new OrElse(this, fn)
  }

  // Applies the successful value of task `withF` to to the successful value of task `withX`
  ap<F1>(otherTask: Task<any, F1>): Task<any, F | F1> {
    return Task.all([(this: Task<any, F>), otherTask]).map(([f, x]) => f(x))
  }

  // Selects the earlier of the two tasks
  concat<S1, F1>(otherTask: Task<S1, F1>): Task<S | S1, F | F1> {
    return Task.race([this, otherTask])
  }

  _run(handlers: Handlers<S, F>): Cancel {
    throw new Error('Method run() is not implemented in basic Task class.')
  }

  run(h: LooseHandlers<S, F>): Cancel {
    const handlers = typeof h === 'function'
      ? {success: h, failure: defaultFailureHandler}
      : {success: h.success || noop, failure: h.failure || defaultFailureHandler, catch: h.catch}
    return this._run(handlers)
  }

  runAndPrintResult(): void {
    this.run(
      x => console.log('Success:', x),
      x => console.log('Failure:', x)
    )
  }

}

class FromComputation<S, F> extends Task<S, F> {

  _computation: Computation<S, F>;

  constructor(computation: Computation<S, F>) {
    super()
    this._computation = computation
  }

  _run(handlers: Handlers<S, F>) {
    return safeRun2((s, f, c) => {
      let cancel
      if (c) {
        try {
          cancel = this._computation(s, f)
        } catch (e) { c(e) }
      } else {
        cancel = this._computation(s, f)
      }
      return {onCancel: cancel || noop}
    }, handlers)
  }

}

class Of<S> extends Task<S, any> {

  _value: S;

  constructor(value: S) {
    super()
    this._value = value
  }

  _run(handlers: Handlers<S, any>): Cancel {
    handlers.success(this._value)
    return noop
  }

}

class Rejected<F> extends Task<any, F> {

  _error: F;

  constructor(error: F) {
    super()
    this._error = error
  }

  _run(handlers: Handlers<any, F>): Cancel {
    handlers.failure(this._error)
    return noop
  }

}

class Empty<S, F> extends Task<S, F> {

  run(): Cancel {
    return noop
  }

  run(): Cancel {
    return noop
  }

}

class All<S, F> extends Task<S[], F> {

  _tasks: Array<Task<S, F>>;

  constructor(tasks: Array<Task<S, F>>) {
    super()
    this._tasks = tasks
  }

  _run(handlers: Handlers<S[], F>): Cancel {
    return safeRun((success, failure) => {
      const length = this._tasks.length
      const values: Array<?S> = Array(length)
      let completedCount = 0
      const runTask = (task, index) => task.run({
        success(x) {
          values[index] = x
          completedCount++
          if (completedCount === length) {
            success((values: any))
          }
        },
        failure,
      })
      const cancels = this._tasks.map(runTask)
      return {onClose() { cancels.forEach(cancel => cancel()) }}
    }, handlers)
  }

}

class Race<S, F> extends Task<S, F> {

  _tasks: Array<Task<S, F>>;

  constructor(tasks: Array<Task<S, F>>) {
    super()
    this._tasks = tasks
  }

  _run(handlers: Handlers<S, F>): Cancel {
    return safeRun((success, failure) => {
      const handlers = {success, failure}
      const cancels = this._tasks.map(task => task.run(handlers))
      return {onClose() { cancels.forEach(cancel => cancel()) }}
    }, handlers)
  }

}

class Map<SIn, SOut, F> extends Task<SOut, F> {

  _task: Task<SIn, F>;
  _fn: (x: SIn) => SOut;

  constructor(task: Task<SIn, F>, fn: (x: SIn) => SOut) {
    super()
    this._task = task
    this._fn = fn
  }

  _run(handlers: Handlers<SOut, F>): Cancel {
    const {_fn} = this
    return this._task.run({
      success(x) { handlers.success(_fn(x)) },
      failure: handlers.failure,
    })
  }
}

class MapRejected<S, FIn, FOut> extends Task<S, FOut> {

  _task: Task<S, FIn>;
  _fn: (x: FIn) => FOut;

  constructor(task: Task<S, FIn>, fn: (x: FIn) => FOut) {
    super()
    this._task = task
    this._fn = fn
  }

  _run(handlers: Handlers<S, FOut>): Cancel {
    const {_fn} = this
    return this._task.run({
      success: handlers.success,
      failure(x) { handlers.failure(_fn(x)) },
    })
  }
}

class Chain<SIn, SOut, F, F1> extends Task<SOut, F1 | F> {

  _task: Task<SIn, F>;
  _fn: (x: SIn) => Task<SOut, F1>;

  constructor(task: Task<SIn, F>, fn: (x: SIn) => Task<SOut, F1>) {
    super()
    this._task = task
    this._fn = fn
  }

  _run(handlers: Handlers<SOut, F | F1>): Cancel {
    const {_fn} = this
    return safeRun2((success, failure, catch_) => {
      let cancel2 = noop
      const cancel1 = this._task.run({
        success(x) {
          if (catch_) {
            try {
              cancel2 = _fn(x).run({success, failure, catch: catch_})
            } catch (e) { catch_(e) }
          } else {
            cancel2 = _fn(x).run({success, failure})
          }
        },
        failure,
        catch: catch_,
      })
      return {onCancel() { cancel1(); cancel2() }}
    }, handlers)
  }
}

class OrElse<S, S1, FIn, FOut> extends Task<S | S1, FOut> {

  _task: Task<S, FIn>;
  _fn: (x: FIn) => Task<S1, FOut>;

  constructor(task: Task<S, FIn>, fn: (x: FIn) => Task<S1, FOut>) {
    super()
    this._task = task
    this._fn = fn
  }

  _run(handlers: Handlers<S | S1, FOut>): Cancel {
    const {_fn} = this
    return safeRun((success, failure) => {
      let cancel2 = noop
      const cancel1 = this._task.run({
        success,
        failure(x) {
          cancel2 = _fn(x).run({success, failure})
        }
      })
      return () => { cancel1(); cancel2() }
    }, handlers)
  }
}
