#import "PointRequest.h"
@implementation PointRequest {
  id _lock;
  NSTimeInterval (^_clock)(void);
  BOOL (^_stop)(void);
  NSTimeInterval _deadline;
  BOOL _received, _returned, _abandoned, _error, _replyPresent;
  NSUInteger _late, _duplicate;
  id _element, _lateElement;
}
- (instancetype)initWithLock:(id)lock clock:(NSTimeInterval (^)(void))clock deadline:(NSTimeInterval)deadline stop:(BOOL (^)(void))stop {
  if ((self = [super init])) { _lock = lock; _clock = [clock copy]; _deadline = deadline; _stop = [stop copy]; }
  return self;
}
- (void)receive:(id)element error:(NSError *)error {
  BOOL late = _stop() || _clock() >= _deadline;
  @synchronized (_lock) {
    late = late || _abandoned;
    if (_received) _duplicate++;
    if (late) { _late++; if (!_lateElement) _lateElement = element; }
    if (!_received) { _replyPresent = element != nil; _error = error != nil; if (!late) _element = element; }
    _received = YES;
  }
}
- (void)markReturned { @synchronized(_lock) { _returned = YES; } }
- (void)abandon { @synchronized(_lock) { _abandoned = YES; } }
- (id)usableElement { @synchronized(_lock) { return !_error && !_late && !_duplicate && !_abandoned ? _element : nil; } }
- (NSDictionary *)snapshotWithElement:(id __autoreleasing *)element {
  @synchronized(_lock) {
    *element = !_error && !_late && !_duplicate && !_abandoned ? _element : nil;
    return self.snapshot;
  }
}
- (NSDictionary *)snapshot {
  @synchronized(_lock) {
    return @{@"sendReturned":@(_returned ? 1 : 0), @"replyReceived":@(_received ? 1 : 0),
      @"pending":@(_received ? 0 : 1), @"late":@(_late), @"duplicate":@(_duplicate),
      @"retainedObjects":@((_element ? 1 : 0) + (_lateElement ? 1 : 0)),
      @"errorPresent":_error ? @YES : @NO, @"replyPresent":_replyPresent ? @YES : @NO};
  }
}
@end
