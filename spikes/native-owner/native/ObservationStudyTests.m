#import <XCTest/XCTest.h>
#import <objc/runtime.h>
#import "ObservationStudy.h"
#import "RecordEncoding.h"

@interface WrongGetterDevice : NSObject
@end
@implementation WrongGetterDevice
- (NSInteger)accessibilityInterface { XCTFail(@"Incompatible getter must not be invoked"); return 1; }
@end

@interface FakeDevice : NSObject
@property id client;
@property NSUInteger getterCalls;
@end
@implementation FakeDevice
- (id)accessibilityInterface { self.getterCalls += 1; return self.client; }
@end

@interface FakeSnapshot : NSObject
@property id accessibilityElement;
@property id parentAccessibilityElement;
@end
@implementation FakeSnapshot
@end
@interface DirectSnapshotWithNilWrapper : FakeSnapshot
@end
@implementation DirectSnapshotWithNilWrapper
- (id)_rootElementSnapshot { return nil; }
@end
@interface WrappedSnapshot : NSObject
@property FakeSnapshot *root;
@end
@implementation WrappedSnapshot
- (id)_rootElementSnapshot { return self.root; }
@end

@interface FakeClient : NSObject
@property NSArray *points;
@property NSUInteger pointCalls;
@property NSMutableArray *validityArguments;
@property NSMapTable *snapshots;
@property BOOL nilPoint;
@property BOOL alwaysValid;
@property BOOL pointError;
@property BOOL snapshotError;
@property BOOL nilSnapshot;
@property BOOL malformedSnapshot;
@property Class reportedClass;
@end
@implementation FakeClient
- (instancetype)init {
  if ((self = [super init])) {
    _validityArguments = [NSMutableArray array];
    _snapshots = [NSMapTable mapTableWithKeyOptions:NSPointerFunctionsStrongMemory | NSPointerFunctionsObjectPointerPersonality
                                     valueOptions:NSPointerFunctionsStrongMemory];
    _points = @[[NSObject new], [NSObject new]];
    FakeSnapshot *snapshot = [FakeSnapshot new]; snapshot.accessibilityElement = _points[0];
    [_snapshots setObject:snapshot forKey:_points[0]];
  }
  return self;
}
- (Class)class { return self.reportedClass ?: super.class; }
- (id)accessibilityElementForElementAtPoint:(CGPoint)point error:(NSError *__autoreleasing *)error {
  self.pointCalls += 1;
  if (self.pointError) *error = [NSError errorWithDomain:@"test" code:1 userInfo:nil];
  if (self.nilPoint) return nil;
  return self.points[MIN(self.pointCalls - 1, self.points.count - 1)];
}
- (BOOL)isValidElement:(id)element {
  [self.validityArguments addObject:element];
  return self.alwaysValid || self.validityArguments.count == 1 || element == self.points.lastObject;
}
- (id)requestSnapshotForElement:(id)element attributes:(id)attributes parameters:(id)parameters error:(NSError *__autoreleasing *)error {
  if (self.snapshotError) *error = [NSError errorWithDomain:@"test" code:2 userInfo:nil];
  if (self.nilSnapshot) return nil;
  if (self.malformedSnapshot) return @"not-a-snapshot";
  return [self.snapshots objectForKey:element];
}
@end

@interface WrongPointClient : NSObject
@property NSUInteger pointCalls;
@end
@implementation WrongPointClient
- (NSInteger)accessibilityElementForElementAtPoint:(CGPoint)point error:(NSError *__autoreleasing *)error {
  self.pointCalls += 1; return 1;
}
@end

@interface WrongParentSnapshot : NSObject
@property id accessibilityElement;
@property NSUInteger parentCalls;
@end
@implementation WrongParentSnapshot
- (NSInteger)parentAccessibilityElement { self.parentCalls += 1; return 17; }
@end
@interface ThrowingPointClient : FakeClient
@end
@implementation ThrowingPointClient
- (id)accessibilityElementForElementAtPoint:(CGPoint)point error:(NSError *__autoreleasing *)error {
  self.pointCalls += 1; [NSException raise:@"double-exception" format:@"controlled failure"]; return nil;
}
@end

@interface PreparingPointClient : FakeClient
@property NSUInteger pointSignatures;
@property(copy) void (^duringPreparation)(void);
@end
@implementation PreparingPointClient
- (NSMethodSignature *)methodSignatureForSelector:(SEL)selector {
  NSMethodSignature *signature = [super methodSignatureForSelector:selector];
  if (selector == NSSelectorFromString(@"accessibilityElementForElementAtPoint:error:")) {
    self.pointSignatures += 1;
    // First inspection is metadata; the second prepares the actual point invocation.
    if (self.pointSignatures == 2) self.duringPreparation();
  }
  return signature;
}
@end

@interface ObservationStudyTests : XCTestCase
@end
@implementation ObservationStudyTests
- (NSDictionary *)configurationForPlan:(NSString *)plan requestId:(NSString *)request {
  BOOL reference = [plan isEqualToString:@"reference-study"];
  NSDictionary *identity = @{@"plan":plan,
    @"plugin":reference ? @"dev.jev.research.native-owner-20261007-reference" : @"dev.jev.research.native-owner-20261007-metadata",
    @"runner":reference ? @"dev.jev.research.native-owner-20261007-reference.xctrunner" : @"dev.jev.research.native-owner-20261007-metadata.xctrunner",
    @"fixture":reference ? @"dev.jev.research.native-owner-20261007-reference-fixture" : @"dev.jev.research.native-owner-20261007-metadata-fixture"};
  return @{@"requestId":request,@"plan":plan,@"allowance":@10,
           @"studyIdentity":identity,@"expectedStudyIdentity":identity};
}
- (void)testStudyIdentityPrecedesGetterAndMismatchPreventsAcquisition {
  for (NSNumber *mismatch in @[@NO,@YES]) {
    FakeDevice *device = [FakeDevice new]; device.client = [FakeClient new];
    NSMutableDictionary *configuration = [[self configurationForPlan:@"metadata" requestId:@"identity-test"] mutableCopy];
    if (mismatch.boolValue) {
      NSMutableDictionary *actual = [configuration[@"studyIdentity"] mutableCopy];
      actual[@"runner"] = @"dev.foreign.runner"; configuration[@"studyIdentity"] = actual;
    }
    NSMutableArray *records = [NSMutableArray array];
    ObservationStudy *study = [[ObservationStudy alloc] initWithDevice:device configuration:configuration
      clock:^{ return 10.0; } stop:^{ return NO; } readFixture:^{ return (NSDictionary *)nil; }
      activateFixture:^{ XCTFail(@"Metadata must not activate"); return NO; }
      wait:^(NSTimeInterval seconds) { XCTFail(@"Metadata must not wait"); }
      emit:^(NSDictionary *record) {
        if (record[@"details"][@"studyIdentity"]) XCTAssertEqual(device.getterCalls,0u);
        [records addObject:record];
      }];
    [study run];
    if (mismatch.boolValue) {
      XCTAssertEqual(device.getterCalls,0u);
      XCTAssertTrue([self hasReason:@"study-identity-mismatch" records:records]);
      XCTAssertEqualObjects(records.lastObject[@"outcome"],@"failed");
    } else {
      XCTAssertEqualObjects(records[1][@"details"][@"studyIdentity"],configuration[@"studyIdentity"]);
      XCTAssertEqualObjects(records[1][@"sequence"],@1);
      XCTAssertEqual(device.getterCalls,1u);
    }
  }
}
- (void)testFixtureIdentityAndPIDRemainRequiredThroughActivationAndRecreation {
  for (NSString *mode in @[@"wrong-bundle",@"missing-bundle",@"activation-pid",@"recreation-bundle",@"replacement-pid"]) {
    FakeDevice *device = [FakeDevice new]; FakeClient *client = [FakeClient new]; device.client = client;
    NSMutableArray *records = [NSMutableArray array];
    __block BOOL activated = NO, recreated = NO;
    __block NSUInteger reads = 0, activations = 0;
    ObservationStudy *study = [[ObservationStudy alloc] initWithDevice:device
      configuration:[self configurationForPlan:@"reference-study" requestId:@"fixture-agreement"]
      clock:^{ return 10.0; } stop:^{ return NO; }
      readFixture:^{
        reads += 1;
        NSMutableDictionary *telemetry = [@{@"pid":@42,@"generation":recreated ? @1 : @0,@"ordinary":@0,
          @"bundleIdentifier":@"dev.jev.research.native-owner-20261007-reference-fixture"} mutableCopy];
        if ([mode isEqual:@"wrong-bundle"] || ([mode isEqual:@"recreation-bundle"] && reads == 3))
          telemetry[@"bundleIdentifier"] = @"dev.foreign.fixture";
        if ([mode isEqual:@"missing-bundle"]) [telemetry removeObjectForKey:@"bundleIdentifier"];
        if (([mode isEqual:@"activation-pid"] && activated) || ([mode isEqual:@"replacement-pid"] && recreated))
          telemetry[@"pid"] = @43;
        return telemetry;
      }
      activateFixture:^{ activations += 1; activated = YES; return YES; }
      wait:^(NSTimeInterval seconds) { XCTFail(@"Every test supplies an immediate reply"); }
      emit:^(NSDictionary *record) {
        [records addObject:record];
        if ([record[@"details"][@"request"] isEqual:@"recreate"]) recreated = YES;
      }];
    [study run];
    XCTAssertEqualObjects(records.lastObject[@"outcome"],@"failed");
    if ([mode isEqual:@"wrong-bundle"] || [mode isEqual:@"missing-bundle"]) {
      XCTAssertEqual(activations,0u); XCTAssertEqual(client.pointCalls,0u);
      XCTAssertTrue([self hasReason:@"invalid-fixture-telemetry" records:records]);
    } else if ([mode isEqual:@"activation-pid"]) {
      XCTAssertEqual(activations,1u); XCTAssertEqual(client.pointCalls,0u);
      XCTAssertTrue([self hasReason:@"fixture-changed-during-activation" records:records]);
    } else {
      XCTAssertEqual(client.pointCalls,1u);
      if ([mode isEqual:@"recreation-bundle"]) {
        XCTAssertFalse(recreated);
        XCTAssertTrue([self hasReason:@"invalid-fixture-telemetry" records:records]);
      } else XCTAssertTrue([self hasReason:@"fixture-pid-changed" records:records]);
    }
  }
}
- (NSArray *)runDevice:(id)device plan:(NSString *)plan stop:(BOOL (^)(void))stop {
  NSMutableArray *records = [NSMutableArray array];
  __block NSTimeInterval now = 10;
  __block BOOL recreate = NO;
  ObservationStudy *study = [[ObservationStudy alloc] initWithDevice:device
    configuration:[self configurationForPlan:plan requestId:@"policy-test"]
    clock:^{ return now; } stop:stop
    readFixture:^{ return @{@"pid": @42, @"generation": recreate ? @1 : @0, @"ordinary": @0, @"bundleIdentifier": @"dev.jev.research.native-owner-20261007-reference-fixture"}; }
    activateFixture:^{ return YES; }
    wait:^(NSTimeInterval seconds) { now += seconds; }
    emit:^(NSDictionary *record) {
      [records addObject:record];
      if ([record[@"details"][@"request"] isEqual:@"recreate"]) recreate = YES;
    }];
  [study run];
  XCTAssertEqualObjects(records.firstObject[@"kind"], @"started");
  XCTAssertEqualObjects(records.lastObject[@"kind"], @"finished");
  XCTAssertEqualObjects(records.lastObject[@"details"][@"nativeSettlement"], @"unconfirmed");
  XCTAssertEqualObjects(records.lastObject[@"details"][@"coverage"],
    (@{@"originalAncestry": @"unestablished", @"referenceLifetime": @"unestablished", @"independentAssociations": @"unestablished"}));
  NSUInteger total = 0;
  for (NSUInteger index = 0; index < records.count; index++) {
    NSDictionary *record = records[index];
    XCTAssertEqualObjects(record[@"sequence"], @(index));
    XCTAssertEqualObjects(record[@"inputCalls"], @0);
    total += [NSJSONSerialization dataWithJSONObject:record options:0 error:nil].length + 1;
  }
  XCTAssertLessThanOrEqual(total, 1024u * 1024u);
  return records;
}
- (NSArray *)runClient:(id)client {
  FakeDevice *device = [FakeDevice new]; device.client = client;
  return [self runDevice:device plan:@"reference-study" stop:^{ return NO; }];
}
- (NSArray *)operation:(NSString *)operation records:(NSArray *)records {
  return [records filteredArrayUsingPredicate:[NSPredicate predicateWithBlock:^BOOL(NSDictionary *record, NSDictionary *bindings) {
    return [record[@"operation"] isEqual:operation] && [record[@"kind"] isEqual:@"observation"];
  }]];
}
- (BOOL)hasReason:(NSString *)reason records:(NSArray *)records {
  return [records indexOfObjectPassingTest:^BOOL(NSDictionary *record, NSUInteger index, BOOL *stop) {
    return [record[@"details"][@"reason"] isEqual:reason];
  }] != NSNotFound;
}
- (void)assertWireBooleanTypes:(id)value found:(NSMutableSet *)found {
  NSSet *booleanFields = [NSSet setWithArray:@[@"available", @"replyPresent", @"errorPresent",
    @"sameLocalObject", @"invoked", @"parentPresent", @"value",
    @"localMethodsReturned", @"localReferencesReleased"]];
  if ([value isKindOfClass:NSDictionary.class]) {
    for (NSString *key in value) {
      id item = value[key];
      if ([booleanFields containsObject:key]) {
        XCTAssertTrue([item isKindOfClass:NSNumber.class], @"%@ must be a JSON boolean", key);
        if ([item isKindOfClass:NSNumber.class])
          XCTAssertEqual(CFGetTypeID((__bridge CFTypeRef)item), CFBooleanGetTypeID(), @"%@ must not be a numeric 0/1", key);
        [found addObject:key];
      }
      [self assertWireBooleanTypes:item found:found];
    }
  } else if ([value isKindOfClass:NSArray.class]) {
    for (id item in value) [self assertWireBooleanTypes:item found:found];
  }
}
- (NSArray *)wireRecords:(NSArray *)records found:(NSMutableSet *)found {
  NSMutableArray *decoded = [NSMutableArray array];
  for (NSDictionary *record in records) {
    NSData *encoded = EncodeNativeRecord(record, 1024 * 1024, nil);
    XCTAssertNotNil(encoded);
    // The iOS emitter uses this Foundation serializer directly.
    NSData *emitted = [NSJSONSerialization dataWithJSONObject:record options:0 error:nil];
    XCTAssertEqualObjects(encoded, emitted);
    NSDictionary *wire = [NSJSONSerialization JSONObjectWithData:emitted options:0 error:nil];
    XCTAssertNotNil(wire);
    [self assertWireBooleanTypes:record found:found];
    [self assertWireBooleanTypes:wire found:found];
    if (wire) [decoded addObject:wire];
  }
  return decoded;
}
- (void)testCompletionUsesBooleanJSONTokensAndNumericCounters {
  for (NSNumber *normalReturn in @[@YES, @NO]) {
    FakeDevice *device = [FakeDevice new];
    device.client = normalReturn.boolValue ? [FakeClient new] : [ThrowingPointClient new];
    NSArray *records = [self runDevice:device plan:normalReturn.boolValue ? @"metadata" : @"reference-study"
                                stop:^{ return NO; }];
    NSMutableSet *found = [NSMutableSet set];
    NSDictionary *finished = [self wireRecords:records found:found].lastObject;
    XCTAssertEqualObjects(finished[@"details"][@"localMethodsReturned"], normalReturn);
    XCTAssertEqualObjects(finished[@"details"][@"localReferencesReleased"], @YES);
    NSString *json = [[NSString alloc] initWithData:EncodeNativeRecord(records.lastObject, 2048, nil)
                                         encoding:NSUTF8StringEncoding];
    XCTAssertTrue([json containsString:normalReturn.boolValue ? @"\"localMethodsReturned\":true" : @"\"localMethodsReturned\":false"]);
    XCTAssertTrue([json containsString:@"\"localReferencesReleased\":true"]);
    for (NSNumber *counter in @[finished[@"inputCalls"], finished[@"sequence"],
                                finished[@"details"][@"runnerPID"], finished[@"details"][@"appElementQueries"]])
      XCTAssertNotEqual(CFGetTypeID((__bridge CFTypeRef)counter), CFBooleanGetTypeID());
    XCTAssertTrue([found containsObject:@"localMethodsReturned"]);
    XCTAssertTrue([found containsObject:@"localReferencesReleased"]);
  }
}
- (void)testObservationBooleanFieldsKeepTheirTypesThroughRealJSONSerialization {
  NSMutableSet *found = [NSMutableSet set];
  for (NSString *scenario in @[@"ordinary", @"nil-point", @"point-error", @"nil-snapshot",
                               @"snapshot-error", @"nil-wrapper", @"wrapped", @"distinct-element", @"parent"]) {
    FakeClient *client = [FakeClient new];
    FakeSnapshot *snapshot = [client.snapshots objectForKey:client.points[0]];
    if ([scenario isEqual:@"nil-point"]) client.nilPoint = YES;
    if ([scenario isEqual:@"point-error"]) client.pointError = YES;
    if ([scenario isEqual:@"nil-snapshot"]) client.nilSnapshot = YES;
    if ([scenario isEqual:@"snapshot-error"]) client.snapshotError = YES;
    if ([scenario isEqual:@"nil-wrapper"]) {
      DirectSnapshotWithNilWrapper *direct = [DirectSnapshotWithNilWrapper new];
      direct.accessibilityElement = client.points[0];
      [client.snapshots setObject:direct forKey:client.points[0]];
    }
    if ([scenario isEqual:@"wrapped"]) {
      WrappedSnapshot *wrapper = [WrappedSnapshot new]; wrapper.root = snapshot;
      [client.snapshots setObject:wrapper forKey:client.points[0]];
    }
    if ([scenario isEqual:@"distinct-element"]) snapshot.accessibilityElement = [NSObject new];
    if ([scenario isEqual:@"parent"]) snapshot.parentAccessibilityElement = client.points[0];
    [self wireRecords:[self runClient:client] found:found];
  }
  [self wireRecords:[self runClient:[WrongPointClient new]] found:found];
  XCTAssertEqualObjects(found, ([NSSet setWithArray:@[@"available", @"replyPresent", @"errorPresent",
    @"sameLocalObject", @"invoked", @"parentPresent", @"value",
    @"localMethodsReturned", @"localReferencesReleased"]]));
}
- (void)testIncompatibleGetterEmitsUnavailableAndFinishesWithoutQueries {
  NSArray *records = [self runDevice:[WrongGetterDevice new] plan:@"metadata" stop:^{ return NO; }];
  XCTAssertEqual(records.count, 4u);
  if (records.count != 4) return;
  XCTAssertEqualObjects(records[2][@"outcome"], @"unavailable");
  XCTAssertEqualObjects(records.lastObject[@"details"][@"appElementQueries"], @0);
}
- (void)testMetadataDoesNotAcquireFixtureElements {
  FakeClient *client = [FakeClient new]; FakeDevice *device = [FakeDevice new]; device.client = client;
  NSArray *records = [self runDevice:device plan:@"metadata" stop:^{ return NO; }];
  XCTAssertEqual(client.pointCalls, 0u);
  XCTAssertEqualObjects(records.lastObject[@"outcome"], @"observed");
  XCTAssertEqualObjects(records.lastObject[@"details"][@"appElementQueries"], @0);
}
- (void)testWrongPointABIRefusesInvocation {
  WrongPointClient *client = [WrongPointClient new]; NSArray *records = [self runClient:client];
  XCTAssertEqual(client.pointCalls, 0u);
  XCTAssertTrue([self hasReason:@"unsupported-abi" records:records]);
}
- (void)testNilPointIsFailedAndNeverRecreated {
  FakeClient *client = [FakeClient new]; client.nilPoint = YES;
  NSArray *records = [self runClient:client];
  XCTAssertTrue([self hasReason:@"nil-reply" records:records]);
  XCTAssertEqual(client.validityArguments.count, 0u);
  XCTAssertFalse([records indexOfObjectPassingTest:^BOOL(NSDictionary *record, NSUInteger index, BOOL *stop) {
    return [record[@"details"][@"request"] isEqual:@"recreate"];
  }] != NSNotFound);
}
- (void)testErrorPointDoesNotAcceptReturnedObject {
  FakeClient *client = [FakeClient new]; client.pointError = YES;
  NSArray *records = [self runClient:client];
  XCTAssertTrue([self hasReason:@"native-error" records:records]);
  XCTAssertEqual(client.validityArguments.count, 0u);
}
- (void)testNilSnapshotAndSnapshotErrorRemainExplicit {
  FakeClient *nilClient = [FakeClient new]; nilClient.nilSnapshot = YES;
  XCTAssertTrue([self hasReason:@"nil-reply" records:[self runClient:nilClient]]);
  FakeClient *errorClient = [FakeClient new]; errorClient.snapshotError = YES;
  XCTAssertTrue([self hasReason:@"native-error" records:[self runClient:errorClient]]);
}
- (void)testMalformedSnapshotCannotSupplyParents {
  FakeClient *client = [FakeClient new]; client.malformedSnapshot = YES;
  NSArray *records = [self runClient:client];
  XCTAssertTrue([self hasReason:@"unsupported-abi" records:records]);
  XCTAssertEqual([self operation:@"parent" records:records].count, 0u);
}
- (void)testNilWrapperPreservesValidDirectSnapshot {
  FakeClient *client = [FakeClient new];
  DirectSnapshotWithNilWrapper *snapshot = [DirectSnapshotWithNilWrapper new];
  snapshot.accessibilityElement = client.points[0]; [client.snapshots setObject:snapshot forKey:client.points[0]];
  NSArray *snapshots = [self operation:@"snapshot" records:[self runClient:client]];
  XCTAssertEqualObjects(snapshots.firstObject[@"details"][@"route"], @"direct-after-nil-wrapper");
}
- (void)testRetainedObjectValidatedAfterReplacementWithoutRepair {
  FakeClient *client = [FakeClient new]; NSArray *records = [self runClient:client];
  XCTAssertEqual(client.validityArguments.count, 3u);
  if (client.validityArguments.count != 3) return;
  XCTAssertTrue(client.validityArguments[0] == client.points[0]);
  XCTAssertTrue(client.validityArguments[1] == client.points[0]);
  XCTAssertTrue(client.validityArguments[2] == client.points[1]);
  NSArray *validity = [self operation:@"validity" records:records];
  XCTAssertEqualObjects(validity[1][@"details"][@"value"], @NO);
  XCTAssertEqualObjects(validity[2][@"details"][@"value"], @YES);
  XCTAssertEqualObjects(records.lastObject[@"details"][@"localReferencesReleased"], @YES);
}
- (void)testRepeatedLocalParentStopsAtCycle {
  FakeClient *client = [FakeClient new];
  FakeSnapshot *snapshot = [client.snapshots objectForKey:client.points[0]];
  snapshot.parentAccessibilityElement = client.points[0];
  NSArray *records = [self runClient:client];
  XCTAssertTrue([self hasReason:@"local-object-cycle" records:records]);
  NSArray *parents = [self operation:@"parent" records:records];
  XCTAssertEqual(parents.count, 2u); // one observed edge, one explicit failed cycle
}
- (void)testParentWalkAllows32EdgesAndRefusesThe33rd {
  FakeClient *client = [FakeClient new]; id item = client.points[0];
  for (NSUInteger index = 0; index < 33; index++) {
    id parent = [NSObject new]; FakeSnapshot *snapshot = [FakeSnapshot new];
    snapshot.accessibilityElement = item; snapshot.parentAccessibilityElement = parent;
    [client.snapshots setObject:snapshot forKey:item]; item = parent;
  }
  NSArray *records = [self runClient:client];
  NSArray *parents = [self operation:@"parent" records:records];
  XCTAssertEqual(parents.count, 33u);
  XCTAssertEqualObjects(parents[31][@"details"][@"edge"], @32);
  XCTAssertEqualObjects(parents[32][@"details"][@"reason"], @"parent-limit");
  XCTAssertEqualObjects(parents[32][@"details"][@"edges"], @32);
}
- (void)testExact1024ByteStringAcceptedAndOneOverRefused {
  for (NSUInteger length = 1024; length <= 1025; length++) {
    NSString *name = [@"N" stringByPaddingToLength:length withString:@"x" startingAtIndex:0];
    Class type = objc_getClass(name.UTF8String);
    if (type == Nil) { type = objc_allocateClassPair(NSObject.class, name.UTF8String, 0); objc_registerClassPair(type); }
    FakeClient *client = [FakeClient new]; client.reportedClass = type;
    FakeDevice *device = [FakeDevice new]; device.client = client;
    NSArray *records = [self runDevice:device plan:@"metadata" stop:^{ return NO; }];
    if (length == 1024) XCTAssertEqualObjects(records.lastObject[@"outcome"], @"observed");
    else { XCTAssertTrue([self hasReason:@"string-limit" records:records]); XCTAssertEqualObjects(records.lastObject[@"outcome"], @"failed"); }
  }
}
- (void)testStopBeforeAcquisitionStartsNoNativeMethod {
  FakeClient *client = [FakeClient new]; FakeDevice *device = [FakeDevice new]; device.client = client;
  NSArray *records = [self runDevice:device plan:@"reference-study" stop:^{ return YES; }];
  XCTAssertTrue([self hasReason:@"admission-stopped" records:records]);
  XCTAssertEqual(client.pointCalls, 0u);
  XCTAssertEqualObjects(records.lastObject[@"details"][@"appElementQueries"], @0);
}
- (void)testEncodingCountsUTF8BytesRatherThanCharacters {
  NSString *exact = [@"" stringByPaddingToLength:512 withString:@"é" startingAtIndex:0];
  NSString *over = [exact stringByAppendingString:@"é"];
  NSString *reason = nil;
  XCTAssertNotNil(EncodeNativeRecord(@{@"x": exact}, 1024 * 1024, &reason));
  XCTAssertNil(reason);
  XCTAssertNil(EncodeNativeRecord(@{@"x": over}, 1024 * 1024, &reason));
  XCTAssertEqualObjects(reason, @"string-limit");
}
- (void)testAggregateEncodingAcceptsExactly1MiBAndRefusesOneByteOver {
  NSString *plain = [@"" stringByPaddingToLength:1024 withString:@"a" startingAtIndex:0];
  NSMutableArray *values = [NSMutableArray arrayWithCapacity:1021];
  for (NSUInteger index = 0; index < 1021; index++) [values addObject:plain];
  // Base JSON + newline is 1,048,575 bytes. One escaped newline adds one encoded byte.
  values[0] = [[plain substringToIndex:1023] stringByAppendingString:@"\n"];
  NSString *reason = nil;
  NSData *exact = EncodeNativeRecord(@{@"x": values}, 1024 * 1024, &reason);
  XCTAssertEqual(exact.length + 1, 1048576u);
  XCTAssertNil(reason);
  values[0] = [[plain substringToIndex:1022] stringByAppendingString:@"\n\n"];
  XCTAssertNil(EncodeNativeRecord(@{@"x": values}, 1024 * 1024, &reason));
  XCTAssertEqualObjects(reason, @"stream-limit");
}
- (void)testEncodingRespectsRemainingStreamAllowance {
  NSString *reason = nil;
  XCTAssertNotNil(EncodeNativeRecord(@{@"x": @0}, 8, &reason));
  XCTAssertNil(EncodeNativeRecord(@{@"x": @0}, 7, &reason));
  XCTAssertEqualObjects(reason, @"stream-limit");
}
- (void)testSurprisingOldValidityIsRecordedWithoutInventingLifetimeGuarantee {
  FakeClient *client = [FakeClient new]; client.alwaysValid = YES;
  NSArray *records = [self runClient:client];
  NSArray *validity = [self operation:@"validity" records:records];
  XCTAssertEqualObjects(validity[1][@"details"][@"value"], @YES);
  XCTAssertEqualObjects(validity[1][@"details"][@"lifetimeScope"], @"unestablished");
  XCTAssertEqualObjects(records.lastObject[@"outcome"], @"observed");
}
- (void)testCancellationAfterRecreationRequestPreventsFurtherReads {
  FakeClient *client = [FakeClient new]; FakeDevice *device = [FakeDevice new]; device.client = client;
  NSMutableArray *records = [NSMutableArray array]; __block BOOL stopped = NO;
  ObservationStudy *study = [[ObservationStudy alloc] initWithDevice:device
    configuration:[self configurationForPlan:@"reference-study" requestId:@"cancel-test"]
    clock:^{ return 10.0; } stop:^{ return stopped; }
    readFixture:^{ return @{@"pid": @42, @"generation": @0, @"ordinary": @0, @"bundleIdentifier": @"dev.jev.research.native-owner-20261007-reference-fixture"}; }
    activateFixture:^{ return YES; } wait:^(NSTimeInterval seconds) { XCTFail(@"No wait after stopped admission"); }
    emit:^(NSDictionary *record) {
      [records addObject:record]; if ([record[@"details"][@"request"] isEqual:@"recreate"]) stopped = YES;
    }];
  [study run];
  XCTAssertEqual(client.pointCalls, 1u); XCTAssertEqual(client.validityArguments.count, 1u);
  XCTAssertTrue([self hasReason:@"admission-stopped" records:records]);
}
- (void)testWrongParentGetterABIIsNotInvoked {
  FakeClient *client = [FakeClient new]; WrongParentSnapshot *snapshot = [WrongParentSnapshot new];
  snapshot.accessibilityElement = client.points[0]; [client.snapshots setObject:snapshot forKey:client.points[0]];
  NSArray *records = [self runClient:client];
  XCTAssertEqual(snapshot.parentCalls, 0u);
  XCTAssertTrue([self hasReason:@"unsupported-abi" records:records]);
}
- (void)testSnapshotWithoutNativeElementCannotSupplyParentage {
  FakeClient *client = [FakeClient new];
  FakeSnapshot *snapshot = [client.snapshots objectForKey:client.points[0]]; snapshot.accessibilityElement = nil;
  NSArray *records = [self runClient:client];
  XCTAssertTrue([self hasReason:@"nil-native-element" records:records]);
  XCTAssertEqual([self operation:@"parent" records:records].count, 0u);
}
- (void)testThrownNativeCallDoesNotCertifyLocalMethodReturn {
  ThrowingPointClient *client = [ThrowingPointClient new]; NSArray *records = [self runClient:client];
  XCTAssertTrue([self hasReason:@"native-exception" records:records]);
  XCTAssertEqualObjects(records.lastObject[@"details"][@"localMethodsReturned"], @NO);
  XCTAssertEqualObjects(records.lastObject[@"outcome"], @"failed");
}
- (void)testExpiryOrStopDuringPreActivationEmissionStartsNoActivation {
  for (NSNumber *expire in @[@YES, @NO]) {
    FakeClient *client = [FakeClient new]; FakeDevice *device = [FakeDevice new]; device.client = client;
    NSMutableArray *records = [NSMutableArray array];
    __block NSTimeInterval now = 10;
    __block BOOL stopped = NO;
    __block NSUInteger activations = 0;
    ObservationStudy *study = [[ObservationStudy alloc] initWithDevice:device
      configuration:[self configurationForPlan:@"reference-study" requestId:@"activation-admission"]
      clock:^{ return now; } stop:^{ return stopped; }
      readFixture:^{ return @{@"pid": @42, @"generation": @0, @"ordinary": @0, @"bundleIdentifier": @"dev.jev.research.native-owner-20261007-reference-fixture"}; }
      activateFixture:^{ activations += 1; return YES; }
      wait:^(NSTimeInterval seconds) { now += seconds; }
      emit:^(NSDictionary *record) {
        [records addObject:record];
        if ([record[@"details"][@"phase"] isEqual:@"before-activation"]) {
          if (expire.boolValue) now = 20; else stopped = YES;
        }
      }];
    [study run];
    XCTAssertEqual(activations, 0u, @"No activation after %@ during emission", expire.boolValue ? @"expiry" : @"stop");
    XCTAssertEqual(client.pointCalls, 0u);
    XCTAssertEqualObjects(records.lastObject[@"details"][@"appElementQueries"], @0);
    XCTAssertTrue([self hasReason:@"admission-stopped" records:records]);
  }
}
- (void)testExpiryOrStopDuringSignaturePreparationStartsNoNativeQuery {
  for (NSNumber *expire in @[@YES, @NO]) {
    PreparingPointClient *client = [PreparingPointClient new];
    FakeDevice *device = [FakeDevice new]; device.client = client;
    NSMutableArray *records = [NSMutableArray array];
    __block NSTimeInterval now = 10;
    __block BOOL stopped = NO;
    client.duringPreparation = ^{ if (expire.boolValue) now = 20; else stopped = YES; };
    ObservationStudy *study = [[ObservationStudy alloc] initWithDevice:device
      configuration:[self configurationForPlan:@"reference-study" requestId:@"query-admission"]
      clock:^{ return now; } stop:^{ return stopped; }
      readFixture:^{ return @{@"pid": @42, @"generation": @0, @"ordinary": @0, @"bundleIdentifier": @"dev.jev.research.native-owner-20261007-reference-fixture"}; }
      activateFixture:^{ return YES; } wait:^(NSTimeInterval seconds) { now += seconds; }
      emit:^(NSDictionary *record) { [records addObject:record]; }];
    [study run];
    XCTAssertEqual(client.pointSignatures, 2u);
    XCTAssertEqual(client.pointCalls, 0u, @"No point invocation after %@ during preparation", expire.boolValue ? @"expiry" : @"stop");
    XCTAssertEqual(client.validityArguments.count, 0u);
    XCTAssertEqualObjects(records.lastObject[@"details"][@"appElementQueries"], @0);
    XCTAssertEqualObjects(records.lastObject[@"details"][@"localMethodsReturned"], @YES);
    XCTAssertTrue([self hasReason:@"admission-stopped" records:records]);
  }
}
@end
