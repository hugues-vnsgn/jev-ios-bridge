#import <UIKit/UIKit.h>

// Owned synthetic app: its file hook changes the view without sending input.
@interface FixtureController : UIViewController
@property(nonatomic, strong) UIButton *ordinary;
@property(nonatomic, strong) UILabel *status;
@property(nonatomic, strong) NSTimer *timer;
@property(nonatomic) NSUInteger generation;
@property(nonatomic) NSUInteger ordinaryTaps;
@end

@implementation FixtureController
- (NSURL *)documents {
  return [NSURL fileURLWithPath:[NSHomeDirectory() stringByAppendingPathComponent:@"Documents"]];
}
- (void)writeTelemetry {
  NSDictionary *record = @{@"pid": @(NSProcessInfo.processInfo.processIdentifier),
    @"generation": @(self.generation), @"ordinary": @(self.ordinaryTaps)};
  NSData *data = [NSJSONSerialization dataWithJSONObject:record options:0 error:nil];
  [data writeToURL:[[self documents] URLByAppendingPathComponent:@"result.txt"]
          options:NSDataWritingAtomic error:nil];
  self.status.text = [NSString stringWithFormat:@"generation=%lu ordinary=%lu",
    (unsigned long)self.generation, (unsigned long)self.ordinaryTaps];
}
- (void)addOrdinary {
  UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
  button.frame = CGRectMake(40, 140, 240, 60);
  [button setTitle:@"Ordinary reachable" forState:UIControlStateNormal];
  button.accessibilityIdentifier = @"ordinary";
  [button addTarget:self action:@selector(tappedOrdinary) forControlEvents:UIControlEventTouchUpInside];
  [self.view addSubview:button];
  self.ordinary = button;
}
- (void)tappedOrdinary { self.ordinaryTaps += 1; [self writeTelemetry]; }
- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = UIColor.whiteColor;
  self.status = [[UILabel alloc] initWithFrame:CGRectMake(25, 420, 330, 160)];
  self.status.numberOfLines = 0;
  self.status.accessibilityIdentifier = @"status";
  [self.view addSubview:self.status];
  [self addOrdinary];
  [self writeTelemetry];
  __weak FixtureController *weakSelf = self;
  self.timer = [NSTimer scheduledTimerWithTimeInterval:0.1 repeats:YES block:^(NSTimer *timer) {
    FixtureController *controller = weakSelf;
    if (controller == nil) return;
    NSURL *request = [[controller documents] URLByAppendingPathComponent:@"recreate.request"];
    if (![NSFileManager.defaultManager fileExistsAtPath:request.path]) return;
    // Remove a successfully consumed request first; failure never causes repeated replacements.
    if (![NSFileManager.defaultManager removeItemAtURL:request error:nil]) return;
    [controller.ordinary removeFromSuperview];
    [controller addOrdinary];
    controller.generation += 1;
    [controller writeTelemetry];
  }];
}
@end

@interface FixtureApp : UIResponder <UIApplicationDelegate>
@property(nonatomic, strong) UIWindow *window;
@end
@implementation FixtureApp
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
  self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
  self.window.rootViewController = [FixtureController new];
  [self.window makeKeyAndVisible];
  return YES;
}
@end
int main(int argc, char *argv[]) {
  @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(FixtureApp.class)); }
}
