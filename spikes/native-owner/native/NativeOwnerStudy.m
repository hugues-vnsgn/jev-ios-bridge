#import <XCTest/XCTest.h>
#import <XCUIAutomation/XCUIAutomation.h>
#import "ObservationStudy.h"
#import "NativeProvenance.h"

// A reference study owns late callbacks until its process exits.
static ObservationStudy *RetainedReferenceStudy;
static id PointSession(void) {
  Class owner = NSClassFromString(@"XCTRunnerDaemonSession");
  SEL selector = NSSelectorFromString(@"sharedSession");
  NSMethodSignature *signature = [owner methodSignatureForSelector:selector];
  if (![owner respondsToSelector:selector] || signature.numberOfArguments != 2
      || strcmp(signature.methodReturnType, @encode(id)) != 0
      || signature.methodReturnLength != sizeof(id)
      || strcmp([signature getArgumentTypeAtIndex:0], @encode(id)) != 0
      || strcmp([signature getArgumentTypeAtIndex:1], @encode(SEL)) != 0) return nil;
  NSInvocation *invocation = [NSInvocation invocationWithMethodSignature:signature];
  invocation.target = owner; invocation.selector = selector; [invocation invoke];
  __unsafe_unretained id result = nil; [invocation getReturnValue:&result]; return result;
}

@interface NativeOwnerStudy : XCTestCase
@end
@implementation NativeOwnerStudy
+ (void)tearDown {
  [super tearDown];
  printf("JEV_NATIVE_OWNER_CLASS_COMPLETED\n");
  fflush(stdout);
}
- (void)runPlan:(NSString *)expectedPlan {
  NSDictionary *environment = NSProcessInfo.processInfo.environment;
  NSString *requestID = environment[@"JEV_NATIVE_OWNER_REQUEST_ID"];
  NSString *plan = environment[@"JEV_NATIVE_OWNER_PLAN"];
  NSString *stopFile = environment[@"JEV_NATIVE_OWNER_STOP_FILE"];
  NSString *documents = environment[@"JEV_NATIVE_OWNER_FIXTURE_DOCUMENTS"];
  NSString *deadlineString = environment[@"JEV_NATIVE_OWNER_ADMISSION_DEADLINE"];
  NSBundle *pluginBundle = [NSBundle bundleForClass:self.class];
  NSDictionary *info = pluginBundle.infoDictionary;
  NSString *fixtureID = info[@"JevNativeOwnerFixtureBundleIdentifier"];
  NSDictionary *expectedIdentity = @{
    @"plan":info[@"JevNativeOwnerPlan"] ?: @"",
    @"plugin":info[@"JevNativeOwnerPluginBundleIdentifier"] ?: @"",
    @"runner":info[@"JevNativeOwnerRunnerBundleIdentifier"] ?: @"",
    @"fixture":fixtureID ?: @""};
  NSDictionary *actualIdentity = @{@"plan":plan ?: @"",
    @"plugin":pluginBundle.bundleIdentifier ?: @"",
    @"runner":NSBundle.mainBundle.bundleIdentifier ?: @"", @"fixture":fixtureID ?: @""};
  BOOL validIdentity = [actualIdentity isEqualToDictionary:expectedIdentity];
  for (id value in expectedIdentity.allValues)
    validIdentity = validIdentity && [value isKindOfClass:NSString.class] && [value length] > 0
      && [value lengthOfBytesUsingEncoding:NSUTF8StringEncoding] <= 1024;
  double deadline = 0;
  NSScanner *scanner = [NSScanner scannerWithString:deadlineString ?: @""];
  BOOL validDeadline = [scanner scanDouble:&deadline] && scanner.isAtEnd
    && isfinite(deadline) && deadline > NativeAdmissionClock();
  BOOL valid = [requestID isKindOfClass:NSString.class] && requestID.length > 0 && requestID.length <= 128
    && [plan isEqualToString:expectedPlan] && stopFile.isAbsolutePath && validDeadline
    && (![plan isEqualToString:@"reference-study"] || documents.isAbsolutePath) && validIdentity;
  XCTAssertTrue(valid, @"Missing or incompatible explicit study environment");
  if (!valid) return; // The host retains ownership when it receives no complete stream.
  ObservationStudy *study = [[ObservationStudy alloc]
    initWithDevice:XCUIDevice.sharedDevice
    pointSession:^{ return PointSession(); }
    pointProvenance:^NSDictionary *(id session, id client) { return LoadedPointProvenance(session, client); }
    referenceAccess:[ReferenceAccess new]
    configuration:@{@"requestId": requestID, @"plan": plan, @"deadline": @(deadline),
                    @"studyIdentity":actualIdentity, @"expectedStudyIdentity":expectedIdentity}
    clock:^{ return NativeAdmissionClock(); }
    stop:^{ return [NSFileManager.defaultManager fileExistsAtPath:stopFile]; }
    readFixture:^NSDictionary *{
      NSString *path = [documents stringByAppendingPathComponent:@"result.txt"];
      NSFileHandle *file = [NSFileHandle fileHandleForReadingFromURL:[NSURL fileURLWithPath:path] error:nil];
      if (file == nil) return (NSDictionary *)nil;
      NSData *data = [file readDataUpToLength:1025 error:nil];
      [file closeAndReturnError:nil];
      if (data == nil || data.length > 1024) return (NSDictionary *)nil;
      id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
      return [value isKindOfClass:NSDictionary.class] ? value : (NSDictionary *)nil;
    }
    activateFixture:^{
      @try {
        XCUIApplication *fixture = [[XCUIApplication alloc] initWithBundleIdentifier:fixtureID];
        [fixture activate];
        return YES;
      } @catch (NSException *exception) { return NO; }
    }
    wait:^(NSTimeInterval seconds) { [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:seconds]]; }
    emit:^(NSDictionary *record) {
      NSError *error = nil;
      NSData *data = [NSJSONSerialization dataWithJSONObject:record options:0 error:&error];
      XCTAssertNil(error); XCTAssertNotNil(data);
      if (data != nil) {
        NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        printf("JEV_NATIVE_OWNER_V1 %s\n", json.UTF8String); fflush(stdout);
      }
    }];
  if ([plan isEqual:@"reference-study"]) {
    @synchronized (NativeOwnerStudy.class) {
      XCTAssertNil(RetainedReferenceStudy, @"Reference callback owner already retained in this process");
      if (RetainedReferenceStudy != nil) return;
      RetainedReferenceStudy = study;
    }
  }
  [study run];
}
- (void)testMetadataOnly { [self runPlan:@"metadata"]; }
- (void)testReferenceStudy { [self runPlan:@"reference-study"]; }
@end
