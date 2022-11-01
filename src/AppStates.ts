export type AppStateEvent = 'change' | 'memoryWarning' | 'blur' | 'focus';
export type AppStateStatus = | 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export type AppState = {
  currentState: AppStateStatus;
  addEventListener: ( event: AppStateEvent, handler: (newState: AppStateStatus) => void,) => void;
  removeEventListener: ( event: AppStateEvent, handler: (newState: AppStateStatus) => void,) => void;
};