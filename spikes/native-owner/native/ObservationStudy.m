#import "ObservationStudy.h"
#import "RecordEncoding.h"

static const NSUInteger StringLimit = 1024;
static const NSUInteger StreamLimit = 1024 * 1024;
static const NSUInteger ParentLimit = 32;

static BOOL IntegerAtLeast(id value, long long minimum) {
  return [value isKindOfClass:NSNumber.class]
    && CFGetTypeID((__bridge CFTypeRef)value) != CFBooleanGetTypeID()
    && isfinite([value doubleValue]) && [value doubleValue] == [value longLongValue]
    && [value longLongValue] >= minimum;
}

@interface ObservationStudy ()
@property id device;
@property NSDictionary *configuration;
@property(copy) NSTimeInterval (^clock)(void);
@property(copy) BOOL (^stop)(void);
@property(copy) NSDictionary *(^readFixture)(void);
@property(copy) BOOL (^activateFixture)(void);
@property(copy) void (^wait)(NSTimeInterval);
@property(copy) void (^emit)(NSDictionary *);
@property NSTimeInterval started;
@property NSUInteger sequence;
@property NSUInteger bytes;
@property NSUInteger queryCalls;
@property NSUInteger startedCalls;
@property NSUInteger returnedCalls;
@property BOOL failed;
@property BOOL outputStopped;
@property NSMutableArray *references;
@end

@implementation ObservationStudy
- (instancetype)initWithDevice:(id)device configuration:(NSDictionary *)configuration
                         clock:(NSTimeInterval (^)(void))clock stop:(BOOL (^)(void))stop
                   readFixture:(NSDictionary * (^)(void))readFixture
               activateFixture:(BOOL (^)(void))activateFixture
                          wait:(void (^)(NSTimeInterval))wait emit:(void (^)(NSDictionary *))emit {
  if ((self = [super init])) {
    _device = device; _configuration = [configuration copy]; _clock = [clock copy];
    _stop = [stop copy]; _readFixture = [readFixture copy];
    _activateFixture = [activateFixture copy]; _wait = [wait copy]; _emit = [emit copy];
    _references = [NSMutableArray array];
  }
  return self;
}

- (void)record:(NSString *)kind operation:(NSString *)operation
      outcome:(NSString *)outcome details:(NSDictionary *)details {
  if (self.outputStopped && ![kind isEqualToString:@"finished"]) return;
  if (![outcome isEqualToString:@"observed"]) self.failed = YES;
  NSDictionary *record = @{
    @"schema": @"jev.native-owner/1", @"requestId": self.configuration[@"requestId"],
    @"sequence": @(self.sequence), @"kind": kind, @"operation": operation,
    @"outcome": outcome, @"elapsedMs": @(MAX(0, (self.clock() - self.started) * 1000)),
    @"inputCalls": @0, @"details": details
  };
  NSUInteger reserve = [kind isEqualToString:@"finished"] ? 0 : 2048;
  NSString *reason = nil;
  NSData *encoded = EncodeNativeRecord(record, StreamLimit - self.bytes - reserve, &reason);
  if (encoded == nil) {
    self.failed = YES; self.outputStopped = YES;
    // A small final refusal remains representable: never truncate native data into evidence.
    if (![kind isEqualToString:@"finished"]) {
      record = @{@"schema": @"jev.native-owner/1", @"requestId": self.configuration[@"requestId"],
        @"sequence": @(self.sequence), @"kind": @"observation", @"operation": operation,
        @"outcome": @"failed", @"elapsedMs": @(MAX(0, (self.clock() - self.started) * 1000)),
        @"inputCalls": @0, @"details": @{@"reason": reason ?: @"invalid-json"}};
      encoded = EncodeNativeRecord(record, StreamLimit - self.bytes - 2048, nil);
      if (encoded == nil) return;
    } else return; // Missing completion is an explicit host retention condition.
  }
  self.bytes += encoded.length + 1;
  self.sequence += 1;
  self.emit(record);
}

- (BOOL)admit:(NSString *)operation {
  if (self.outputStopped) return NO;
  if (self.stop() || self.clock() - self.started >= [self.configuration[@"allowance"] doubleValue]) {
    [self record:@"observation" operation:operation outcome:@"failed"
         details:@{@"reason": @"admission-stopped"}];
    return NO;
  }
  return YES;
}

- (NSDictionary *)metadata:(id)object selector:(NSString *)name {
  SEL selector = NSSelectorFromString(name);
  NSMethodSignature *signature = [object methodSignatureForSelector:selector];
  if (![object respondsToSelector:selector] || signature == nil)
    return @{@"selector": name, @"available": @NO};
  if (signature.numberOfArguments > 8 || strnlen(signature.methodReturnType, StringLimit + 1) > StringLimit)
    return @{@"selector": name, @"available": @NO, @"reason": @"metadata-limit"};
  NSMutableArray *arguments = [NSMutableArray array];
  for (NSUInteger index = 0; index < signature.numberOfArguments; index++) {
    const char *type = [signature getArgumentTypeAtIndex:index];
    if (strnlen(type, StringLimit + 1) > StringLimit)
      return @{@"selector": name, @"available": @NO, @"reason": @"metadata-limit"};
    [arguments addObject:@(type)];
  }
  return @{@"selector": name, @"available": @YES,
           @"returnType": @(signature.methodReturnType),
           @"returnLength": @(signature.methodReturnLength), @"arguments": arguments};
}

// All private invocation crosses this single ABI/admission/accounting Seam.
- (id)invoke:(id)object selector:(NSString *)name operation:(NSString *)operation
  returnType:(const char *)returnType length:(NSUInteger)returnLength
   arguments:(NSArray<NSString *> *)argumentTypes
   configure:(void (^)(NSInvocation *))configure query:(BOOL)query
      failed:(BOOL *)failed {
  *failed = YES;
  if (![self admit:operation]) return nil;
  SEL selector = NSSelectorFromString(name);
  NSMethodSignature *signature = [object methodSignatureForSelector:selector];
  BOOL valid = [object respondsToSelector:selector] && signature != nil
    && signature.numberOfArguments == argumentTypes.count + 2
    && strcmp(signature.methodReturnType, returnType) == 0
    && signature.methodReturnLength == returnLength
    && strcmp([signature getArgumentTypeAtIndex:0], @encode(id)) == 0
    && strcmp([signature getArgumentTypeAtIndex:1], @encode(SEL)) == 0;
  for (NSUInteger index = 0; valid && index < argumentTypes.count; index++)
    valid = strcmp([signature getArgumentTypeAtIndex:index + 2], argumentTypes[index].UTF8String) == 0;
  if (!valid) {
    [self record:@"observation" operation:operation outcome:@"unavailable"
         details:@{@"source": name, @"reason": @"unsupported-abi"}];
    return nil;
  }
  NSInvocation *invocation = [NSInvocation invocationWithMethodSignature:signature];
  invocation.target = object; invocation.selector = selector; configure(invocation);
  self.startedCalls += 1;
  if (query) self.queryCalls += 1;
  @try {
    [invocation invoke];
    self.returnedCalls += 1;
    *failed = NO;
    if (strcmp(returnType, @encode(BOOL)) == 0) {
      BOOL result = NO; [invocation getReturnValue:&result]; return @(result);
    }
    __unsafe_unretained id result = nil;
    [invocation getReturnValue:&result];
    return result;
  } @catch (NSException *exception) {
    // A throw is not a returned native method. Do not claim normal local accounting.
    [self record:@"observation" operation:operation outcome:@"failed"
         details:@{@"source": name, @"reason": @"native-exception"}];
    return nil;
  }
}

- (id)getter:(id)object name:(NSString *)name operation:(NSString *)operation failed:(BOOL *)failed {
  return [self invoke:object selector:name operation:operation returnType:@encode(id)
               length:sizeof(id) arguments:@[] configure:^(NSInvocation *invocation) {}
                query:![operation isEqualToString:@"metadata"] failed:failed];
}

- (NSString *)label:(id)object {
  NSUInteger index = [self.references indexOfObjectIdenticalTo:object];
  if (index == NSNotFound) { [self.references addObject:object]; index = self.references.count - 1; }
  return [NSString stringWithFormat:@"local-%lu", (unsigned long)index];
}

- (id)point:(id)client phase:(NSString *)phase {
  NSError *__autoreleasing error = nil;
  NSError *__autoreleasing *errorPointer = &error;
  BOOL failed = NO;
  id item = [self invoke:client selector:@"accessibilityElementForElementAtPoint:error:"
    operation:@"point" returnType:@encode(id) length:sizeof(id)
    arguments:@[@(@encode(CGPoint)), @(@encode(NSError *__autoreleasing *))]
    configure:^(NSInvocation *invocation) {
      CGPoint point = CGPointMake(160, 170);
      NSError *__autoreleasing *argumentError = errorPointer;
      [invocation setArgument:&point atIndex:2]; [invocation setArgument:&argumentError atIndex:3];
    } query:YES failed:&failed];
  if (failed) return nil;
  if (item == nil || error != nil) {
    [self record:@"observation" operation:@"point" outcome:@"failed"
         details:@{@"phase": phase, @"source": @"accessibilityElementForElementAtPoint:error:",
                   @"replyPresent": @(item != nil), @"errorPresent": @(error != nil),
                   @"reason": error ? @"native-error" : @"nil-reply"}];
    return nil;
  }
  [self record:@"observation" operation:@"point" outcome:@"observed"
       details:@{@"phase": phase, @"source": @"accessibilityElementForElementAtPoint:error:",
                 @"reference": [self label:item], @"referenceScope": @"local-object-only"}];
  return item;
}

- (void)validity:(id)item client:(id)client phase:(NSString *)phase {
  BOOL failed = NO;
  id result = [self invoke:client selector:@"isValidElement:" operation:@"validity"
    returnType:@encode(BOOL) length:sizeof(BOOL) arguments:@[@(@encode(id))]
    configure:^(NSInvocation *invocation) { id argument = item; [invocation setArgument:&argument atIndex:2]; }
    query:YES failed:&failed];
  if (!failed) [self record:@"observation" operation:@"validity" outcome:@"observed"
    details:@{@"phase": phase, @"reference": [self label:item], @"source": @"isValidElement:",
              @"value": result, @"lifetimeScope": @"unestablished"}];
}

- (id)snapshot:(id)item client:(id)client {
  BOOL failed = NO;
  // Bounded explicit request parameters; never copy an unbounded native defaults object.
  id parameters = @{@"maxDepth": @1, @"maxChildren": @32, @"maxArrayCount": @32,
                    @"traverseFromParentsToChildren": @NO};
  NSError *__autoreleasing error = nil;
  NSError *__autoreleasing *errorPointer = &error;
  id result = [self invoke:client selector:@"requestSnapshotForElement:attributes:parameters:error:"
    operation:@"snapshot" returnType:@encode(id) length:sizeof(id)
    arguments:@[@(@encode(id)), @(@encode(id)), @(@encode(id)), @(@encode(NSError *__autoreleasing *))]
    configure:^(NSInvocation *invocation) {
      id element = item; id attributes = @[]; id argumentParameters = parameters;
      NSError *__autoreleasing *argumentError = errorPointer;
      [invocation setArgument:&element atIndex:2]; [invocation setArgument:&attributes atIndex:3];
      [invocation setArgument:&argumentParameters atIndex:4]; [invocation setArgument:&argumentError atIndex:5];
    } query:YES failed:&failed];
  if (failed) return nil;
  if (result == nil || error != nil) {
    [self record:@"observation" operation:@"snapshot" outcome:@"failed"
         details:@{@"reference": [self label:item], @"source": @"requestSnapshotForElement:attributes:parameters:error:",
                   @"replyPresent": @(result != nil), @"errorPresent": @(error != nil),
                   @"reason": error ? @"native-error" : @"nil-reply"}];
    return nil;
  }
  NSString *route = @"direct-snapshot";
  BOOL rootGetterInvoked = NO, rootGetterNonNil = NO;
  if ([result respondsToSelector:NSSelectorFromString(@"_rootElementSnapshot")]) {
    id direct = result; rootGetterInvoked = YES;
    id root = [self getter:result name:@"_rootElementSnapshot" operation:@"snapshot" failed:&failed];
    if (failed) return nil;
    rootGetterNonNil = root != nil;
    if (root != nil) { result = root; route = @"wrapped-root"; }
    else if ([direct respondsToSelector:NSSelectorFromString(@"accessibilityElement")]
      && [direct respondsToSelector:NSSelectorFromString(@"parentAccessibilityElement")]) {
      result = direct; route = @"direct-after-nil-wrapper";
    } else {
      [self record:@"observation" operation:@"snapshot" outcome:@"failed"
           details:@{@"source": @"_rootElementSnapshot", @"reason": @"nil-root-snapshot"}];
      return nil;
    }
  }
  id nativeElement = [self getter:result name:@"accessibilityElement" operation:@"snapshot" failed:&failed];
  if (failed) return nil;
  if (nativeElement == nil) {
    [self record:@"observation" operation:@"snapshot" outcome:@"failed"
         details:@{@"source": @"accessibilityElement", @"reason": @"nil-native-element"}];
    return nil;
  }
  [self record:@"observation" operation:@"snapshot" outcome:@"observed"
       details:@{@"source": @"requestSnapshotForElement:attributes:parameters:error:",
                 @"requestedReference": [self label:item], @"returnedReference": [self label:nativeElement],
                 @"sameLocalObject": @(nativeElement == item), @"route": route,
                 @"elementGetter": @{@"source": @"accessibilityElement", @"reference": [self label:nativeElement]},
                 @"rootGetter": @{@"source": @"_rootElementSnapshot", @"invoked": @(rootGetterInvoked),
                                  @"replyPresent": @(rootGetterNonNil)}, @"snapshotClass": NSStringFromClass([result class])}];
  return result;
}

- (void)parents:(id)original client:(id)client {
  NSMutableArray *seen = [NSMutableArray array];
  id item = original;
  for (NSUInteger edges = 0; item != nil; edges++) {
    if (edges == ParentLimit) {
      [self record:@"observation" operation:@"parent" outcome:@"failed"
           details:@{@"reason": @"parent-limit", @"edges": @(edges)}];
      return;
    }
    if ([seen indexOfObjectIdenticalTo:item] != NSNotFound) {
      [self record:@"observation" operation:@"parent" outcome:@"failed"
           details:@{@"reason": @"local-object-cycle", @"reference": [self label:item]}];
      return;
    }
    [seen addObject:item];
    id snapshot = [self snapshot:item client:client];
    if (snapshot == nil) return;
    BOOL failed = NO;
    id parent = [self getter:snapshot name:@"parentAccessibilityElement" operation:@"parent" failed:&failed];
    if (failed) return;
    [self record:@"observation" operation:@"parent" outcome:@"observed"
         details:@{@"source": @"parentAccessibilityElement", @"reference": [self label:item],
                   @"parentPresent": @(parent != nil), @"parent": parent ? [self label:parent] : NSNull.null,
                   @"edge": @(edges + 1), @"originalContainment": @"unestablished"}];
    item = parent;
  }
}

- (NSDictionary *)fixture {
  if (![self admit:@"fixture-recreation"]) return nil;
  NSDictionary *value = self.readFixture();
  if (![value isKindOfClass:NSDictionary.class] || value.count != 3
      || !IntegerAtLeast(value[@"pid"], 2) || !IntegerAtLeast(value[@"generation"], 0)
      || !IntegerAtLeast(value[@"ordinary"], 0) || [value[@"ordinary"] longLongValue] != 0) {
    [self record:@"observation" operation:@"fixture-recreation" outcome:@"failed"
         details:@{@"reason": @"invalid-fixture-telemetry"}];
    return nil;
  }
  return value;
}

- (void)referenceStudy:(id)client {
  NSDictionary *beforeActivation = [self fixture];
  if (!beforeActivation || ![self admit:@"fixture-recreation"]) return;
  if ([beforeActivation[@"generation"] longLongValue] != 0) {
    [self record:@"observation" operation:@"fixture-recreation" outcome:@"failed"
         details:@{@"reason": @"fixture-not-initial"}]; return;
  }
  [self record:@"observation" operation:@"fixture-recreation" outcome:@"observed"
       details:@{@"phase": @"before-activation", @"fixturePID": beforeActivation[@"pid"],
                 @"generation": beforeActivation[@"generation"], @"ordinary": beforeActivation[@"ordinary"]}];
  if (!self.activateFixture()) {
    [self record:@"observation" operation:@"fixture-recreation" outcome:@"failed"
         details:@{@"reason": @"activation-failed"}]; return;
  }
  [self record:@"observation" operation:@"fixture-recreation" outcome:@"observed"
       details:@{@"setup": @"activate", @"bundleId": @"dev.jev.research.native-owner-fixture"}];
  NSDictionary *baseline = [self fixture];
  if (!baseline || ![baseline isEqualToDictionary:beforeActivation]) {
    [self record:@"observation" operation:@"fixture-recreation" outcome:@"failed"
         details:@{@"reason": @"fixture-changed-during-activation"}]; return;
  }
  [self record:@"observation" operation:@"fixture-recreation" outcome:@"observed"
       details:@{@"phase": @"after-activation", @"fixturePID": baseline[@"pid"],
                 @"generation": baseline[@"generation"], @"ordinary": baseline[@"ordinary"]}];
  id original = [self point:client phase:@"original"];
  if (original == nil) return;
  [self validity:original client:client phase:@"before-replacement"];
  [self parents:original client:client];
  if (![self admit:@"fixture-recreation"]) return;
  [self record:@"observation" operation:@"fixture-recreation" outcome:@"observed"
       details:@{@"request": @"recreate"}];
  NSTimeInterval waitStarted = self.clock();
  NSDictionary *replaced = nil;
  while (self.clock() - waitStarted < 5) {
    NSDictionary *current = [self fixture];
    if (current == nil) return;
    if (![current[@"pid"] isEqual:baseline[@"pid"]]) {
      [self record:@"observation" operation:@"fixture-recreation" outcome:@"failed"
           details:@{@"reason": @"fixture-pid-changed"}]; return;
    }
    if ([current[@"generation"] longLongValue] > [baseline[@"generation"] longLongValue]) {
      replaced = current; break;
    }
    self.wait(0.05);
  }
  if (replaced == nil) {
    [self record:@"observation" operation:@"fixture-recreation" outcome:@"failed"
         details:@{@"reason": @"replacement-not-observed"}]; return;
  }
  [self record:@"observation" operation:@"fixture-recreation" outcome:@"observed"
       details:@{@"fixturePID": replaced[@"pid"], @"generationBefore": baseline[@"generation"],
                 @"generationAfter": replaced[@"generation"], @"ordinary": replaced[@"ordinary"]}];
  [self validity:original client:client phase:@"after-replacement-retained"];
  id fresh = [self point:client phase:@"fresh"];
  if (fresh != nil) [self validity:fresh client:client phase:@"after-replacement-fresh"];
}

- (void)run {
  self.started = self.clock();
  NSString *plan = self.configuration[@"plan"];
  NSUInteger pid = NSProcessInfo.processInfo.processIdentifier;
  [self record:@"started" operation:@"metadata" outcome:@"observed" details:@{@"plan": plan, @"runnerPID": @(pid)}];
  @autoreleasepool {
    BOOL failed = NO;
    id client = [self getter:self.device name:@"accessibilityInterface" operation:@"metadata" failed:&failed];
    if (!failed && client == nil) {
      [self record:@"observation" operation:@"metadata" outcome:@"unavailable" details:@{@"reason": @"nil-interface"}];
    } else if (!failed) {
      NSMutableArray *methods = [NSMutableArray array];
      for (NSString *name in @[@"accessibilityElementForElementAtPoint:error:", @"isValidElement:",
        @"requestSnapshotForElement:attributes:parameters:error:", @"attributesForElement:attributes:error:"])
        [methods addObject:[self metadata:client selector:name]];
      [self record:@"observation" operation:@"metadata" outcome:@"observed"
           details:@{@"interfaceClass": NSStringFromClass([client class]), @"methods": methods,
                     @"getter": [self metadata:self.device selector:@"accessibilityInterface"]}];
      if ([plan isEqualToString:@"reference-study"]) [self referenceStudy:client];
    }
    [self.references removeAllObjects];
  }
  [self record:@"finished" operation:@"metadata" outcome:self.failed ? @"failed" : @"observed"
       details:@{@"plan": plan, @"runnerPID": @(pid), @"appElementQueries": @(self.queryCalls),
                 @"localMethodsReturned": @(self.startedCalls == self.returnedCalls),
                 @"localReferencesReleased": @(self.references.count == 0),
                 @"nativeSettlement": @"unconfirmed",
                 @"coverage": @{@"originalAncestry": @"unestablished", @"referenceLifetime": @"unestablished",
                                @"independentAssociations": @"unestablished"}}];
}
@end
