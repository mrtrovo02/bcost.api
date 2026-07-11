'use strict';

customElements.define('compodoc-menu', class extends HTMLElement {
    constructor() {
        super();
        this.isNormalMode = this.getAttribute('mode') === 'normal';
    }

    connectedCallback() {
        this.render(this.isNormalMode);
    }

    render(isNormalMode) {
        let tp = lithtml.html(`
        <nav>
            <ul class="list">
                <li class="title">
                    <a href="index.html" data-type="index-link">bcost-api documentation</a>
                </li>

                <li class="divider"></li>
                ${ isNormalMode ? `<div id="book-search-input" role="search"><input type="text" placeholder="Type to search"></div>` : '' }
                <li class="chapter">
                    <a data-type="chapter-link" href="index.html"><span class="icon ion-ios-home"></span>Getting started</a>
                    <ul class="links">
                                <li class="link">
                                    <a href="overview.html" data-type="chapter-link">
                                        <span class="icon ion-ios-keypad"></span>Overview
                                    </a>
                                </li>

                            <li class="link">
                                <a href="index.html" data-type="chapter-link">
                                    <span class="icon ion-ios-paper"></span>
                                        README
                                </a>
                            </li>
                                <li class="link">
                                    <a href="dependencies.html" data-type="chapter-link">
                                        <span class="icon ion-ios-list"></span>Dependencies
                                    </a>
                                </li>
                                <li class="link">
                                    <a href="properties.html" data-type="chapter-link">
                                        <span class="icon ion-ios-apps"></span>Properties
                                    </a>
                                </li>

                    </ul>
                </li>
                    <li class="chapter modules">
                        <a data-type="chapter-link" href="modules.html">
                            <div class="menu-toggler linked" data-bs-toggle="collapse" ${ isNormalMode ?
                                'data-bs-target="#modules-links"' : 'data-bs-target="#xs-modules-links"' }>
                                <span class="icon ion-ios-archive"></span>
                                <span class="link-name">Modules</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                        </a>
                        <ul class="links collapse " ${ isNormalMode ? 'id="modules-links"' : 'id="xs-modules-links"' }>
                            <li class="link">
                                <a href="modules/AnalyticsModule.html" data-type="entity-link" >AnalyticsModule</a>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-AnalyticsModule-92fe74de1a833245cdc7a9a4748ae6d8f703db9b1a16ab95aa08f81b50cbafb94c786c985186231dc46b5620eec8a5feebec7402efa8abba9a4d4d53822eeff3"' : 'data-bs-target="#xs-injectables-links-module-AnalyticsModule-92fe74de1a833245cdc7a9a4748ae6d8f703db9b1a16ab95aa08f81b50cbafb94c786c985186231dc46b5620eec8a5feebec7402efa8abba9a4d4d53822eeff3"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-AnalyticsModule-92fe74de1a833245cdc7a9a4748ae6d8f703db9b1a16ab95aa08f81b50cbafb94c786c985186231dc46b5620eec8a5feebec7402efa8abba9a4d4d53822eeff3"' :
                                        'id="xs-injectables-links-module-AnalyticsModule-92fe74de1a833245cdc7a9a4748ae6d8f703db9b1a16ab95aa08f81b50cbafb94c786c985186231dc46b5620eec8a5feebec7402efa8abba9a4d4d53822eeff3"' }>
                                        <li class="link">
                                            <a href="injectables/ForecastingService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ForecastingService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/AppModule.html" data-type="entity-link" >AppModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-AppModule-e2921ca152c8f84e65c1951371ac58af96a917cfcdda264d0d48db40c4d469cfdfdfd89fec426348661923f7f1d633d7f429b06cda2fa0ff75d7fea01f4791ef"' : 'data-bs-target="#xs-controllers-links-module-AppModule-e2921ca152c8f84e65c1951371ac58af96a917cfcdda264d0d48db40c4d469cfdfdfd89fec426348661923f7f1d633d7f429b06cda2fa0ff75d7fea01f4791ef"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-AppModule-e2921ca152c8f84e65c1951371ac58af96a917cfcdda264d0d48db40c4d469cfdfdfd89fec426348661923f7f1d633d7f429b06cda2fa0ff75d7fea01f4791ef"' :
                                            'id="xs-controllers-links-module-AppModule-e2921ca152c8f84e65c1951371ac58af96a917cfcdda264d0d48db40c4d469cfdfdfd89fec426348661923f7f1d633d7f429b06cda2fa0ff75d7fea01f4791ef"' }>
                                            <li class="link">
                                                <a href="controllers/AppController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AppController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-AppModule-e2921ca152c8f84e65c1951371ac58af96a917cfcdda264d0d48db40c4d469cfdfdfd89fec426348661923f7f1d633d7f429b06cda2fa0ff75d7fea01f4791ef"' : 'data-bs-target="#xs-injectables-links-module-AppModule-e2921ca152c8f84e65c1951371ac58af96a917cfcdda264d0d48db40c4d469cfdfdfd89fec426348661923f7f1d633d7f429b06cda2fa0ff75d7fea01f4791ef"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-AppModule-e2921ca152c8f84e65c1951371ac58af96a917cfcdda264d0d48db40c4d469cfdfdfd89fec426348661923f7f1d633d7f429b06cda2fa0ff75d7fea01f4791ef"' :
                                        'id="xs-injectables-links-module-AppModule-e2921ca152c8f84e65c1951371ac58af96a917cfcdda264d0d48db40c4d469cfdfdfd89fec426348661923f7f1d633d7f429b06cda2fa0ff75d7fea01f4791ef"' }>
                                        <li class="link">
                                            <a href="injectables/AppService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AppService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/AuditLogInterceptor.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AuditLogInterceptor</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/AuditLogListener.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AuditLogListener</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/JwtAuthGuard.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >JwtAuthGuard</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/AuthModule.html" data-type="entity-link" >AuthModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-AuthModule-366e710331e911487cae973e7f51000c224f0ee79fdb4591893fc11eddf4089a0860f614c5a8fd192ccb2d570dd90726caead68eb2bc56eb78d28c2635f28a12"' : 'data-bs-target="#xs-controllers-links-module-AuthModule-366e710331e911487cae973e7f51000c224f0ee79fdb4591893fc11eddf4089a0860f614c5a8fd192ccb2d570dd90726caead68eb2bc56eb78d28c2635f28a12"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-AuthModule-366e710331e911487cae973e7f51000c224f0ee79fdb4591893fc11eddf4089a0860f614c5a8fd192ccb2d570dd90726caead68eb2bc56eb78d28c2635f28a12"' :
                                            'id="xs-controllers-links-module-AuthModule-366e710331e911487cae973e7f51000c224f0ee79fdb4591893fc11eddf4089a0860f614c5a8fd192ccb2d570dd90726caead68eb2bc56eb78d28c2635f28a12"' }>
                                            <li class="link">
                                                <a href="controllers/AuthController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AuthController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-AuthModule-366e710331e911487cae973e7f51000c224f0ee79fdb4591893fc11eddf4089a0860f614c5a8fd192ccb2d570dd90726caead68eb2bc56eb78d28c2635f28a12"' : 'data-bs-target="#xs-injectables-links-module-AuthModule-366e710331e911487cae973e7f51000c224f0ee79fdb4591893fc11eddf4089a0860f614c5a8fd192ccb2d570dd90726caead68eb2bc56eb78d28c2635f28a12"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-AuthModule-366e710331e911487cae973e7f51000c224f0ee79fdb4591893fc11eddf4089a0860f614c5a8fd192ccb2d570dd90726caead68eb2bc56eb78d28c2635f28a12"' :
                                        'id="xs-injectables-links-module-AuthModule-366e710331e911487cae973e7f51000c224f0ee79fdb4591893fc11eddf4089a0860f614c5a8fd192ccb2d570dd90726caead68eb2bc56eb78d28c2635f28a12"' }>
                                        <li class="link">
                                            <a href="injectables/AuthService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AuthService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/JwtStrategy.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >JwtStrategy</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/AutomationModule.html" data-type="entity-link" >AutomationModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-AutomationModule-8b4a62dece0ca519955a1097556074c857c5aa9e44672213603f8de2e72c6edaef13fdcbee91752043d864e67aaca3c470aef1607f309aebcc51e9bfa6f9bf68"' : 'data-bs-target="#xs-controllers-links-module-AutomationModule-8b4a62dece0ca519955a1097556074c857c5aa9e44672213603f8de2e72c6edaef13fdcbee91752043d864e67aaca3c470aef1607f309aebcc51e9bfa6f9bf68"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-AutomationModule-8b4a62dece0ca519955a1097556074c857c5aa9e44672213603f8de2e72c6edaef13fdcbee91752043d864e67aaca3c470aef1607f309aebcc51e9bfa6f9bf68"' :
                                            'id="xs-controllers-links-module-AutomationModule-8b4a62dece0ca519955a1097556074c857c5aa9e44672213603f8de2e72c6edaef13fdcbee91752043d864e67aaca3c470aef1607f309aebcc51e9bfa6f9bf68"' }>
                                            <li class="link">
                                                <a href="controllers/AutomationController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AutomationController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-AutomationModule-8b4a62dece0ca519955a1097556074c857c5aa9e44672213603f8de2e72c6edaef13fdcbee91752043d864e67aaca3c470aef1607f309aebcc51e9bfa6f9bf68"' : 'data-bs-target="#xs-injectables-links-module-AutomationModule-8b4a62dece0ca519955a1097556074c857c5aa9e44672213603f8de2e72c6edaef13fdcbee91752043d864e67aaca3c470aef1607f309aebcc51e9bfa6f9bf68"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-AutomationModule-8b4a62dece0ca519955a1097556074c857c5aa9e44672213603f8de2e72c6edaef13fdcbee91752043d864e67aaca3c470aef1607f309aebcc51e9bfa6f9bf68"' :
                                        'id="xs-injectables-links-module-AutomationModule-8b4a62dece0ca519955a1097556074c857c5aa9e44672213603f8de2e72c6edaef13fdcbee91752043d864e67aaca3c470aef1607f309aebcc51e9bfa6f9bf68"' }>
                                        <li class="link">
                                            <a href="injectables/AutomationJobService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AutomationJobService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/AutomationService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AutomationService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/BankingModule.html" data-type="entity-link" >BankingModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-BankingModule-6266a31eb8b87fc5160dfab56505677fd0236b9d8c2f935cd9abe497531402a04b4cf0cebc99f5aa534af85d879f7100e2b3a04528e19b49a958c7fb3615217d"' : 'data-bs-target="#xs-controllers-links-module-BankingModule-6266a31eb8b87fc5160dfab56505677fd0236b9d8c2f935cd9abe497531402a04b4cf0cebc99f5aa534af85d879f7100e2b3a04528e19b49a958c7fb3615217d"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-BankingModule-6266a31eb8b87fc5160dfab56505677fd0236b9d8c2f935cd9abe497531402a04b4cf0cebc99f5aa534af85d879f7100e2b3a04528e19b49a958c7fb3615217d"' :
                                            'id="xs-controllers-links-module-BankingModule-6266a31eb8b87fc5160dfab56505677fd0236b9d8c2f935cd9abe497531402a04b4cf0cebc99f5aa534af85d879f7100e2b3a04528e19b49a958c7fb3615217d"' }>
                                            <li class="link">
                                                <a href="controllers/BankingController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >BankingController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-BankingModule-6266a31eb8b87fc5160dfab56505677fd0236b9d8c2f935cd9abe497531402a04b4cf0cebc99f5aa534af85d879f7100e2b3a04528e19b49a958c7fb3615217d"' : 'data-bs-target="#xs-injectables-links-module-BankingModule-6266a31eb8b87fc5160dfab56505677fd0236b9d8c2f935cd9abe497531402a04b4cf0cebc99f5aa534af85d879f7100e2b3a04528e19b49a958c7fb3615217d"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-BankingModule-6266a31eb8b87fc5160dfab56505677fd0236b9d8c2f935cd9abe497531402a04b4cf0cebc99f5aa534af85d879f7100e2b3a04528e19b49a958c7fb3615217d"' :
                                        'id="xs-injectables-links-module-BankingModule-6266a31eb8b87fc5160dfab56505677fd0236b9d8c2f935cd9abe497531402a04b4cf0cebc99f5aa534af85d879f7100e2b3a04528e19b49a958c7fb3615217d"' }>
                                        <li class="link">
                                            <a href="injectables/BankingService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >BankingService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/ImportService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ImportService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/ReconciliationService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ReconciliationService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/BusinessRulesModule.html" data-type="entity-link" >BusinessRulesModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-BusinessRulesModule-65a270562aeb6e17c844520e82d6f34fbcc4d4fda1fb298ac1d1f03eb187d07c537b14a16fa3d2f8f7b3e59bda6154669314a410b64deac3b798cd2ac41b7def"' : 'data-bs-target="#xs-controllers-links-module-BusinessRulesModule-65a270562aeb6e17c844520e82d6f34fbcc4d4fda1fb298ac1d1f03eb187d07c537b14a16fa3d2f8f7b3e59bda6154669314a410b64deac3b798cd2ac41b7def"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-BusinessRulesModule-65a270562aeb6e17c844520e82d6f34fbcc4d4fda1fb298ac1d1f03eb187d07c537b14a16fa3d2f8f7b3e59bda6154669314a410b64deac3b798cd2ac41b7def"' :
                                            'id="xs-controllers-links-module-BusinessRulesModule-65a270562aeb6e17c844520e82d6f34fbcc4d4fda1fb298ac1d1f03eb187d07c537b14a16fa3d2f8f7b3e59bda6154669314a410b64deac3b798cd2ac41b7def"' }>
                                            <li class="link">
                                                <a href="controllers/BusinessRulesController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >BusinessRulesController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-BusinessRulesModule-65a270562aeb6e17c844520e82d6f34fbcc4d4fda1fb298ac1d1f03eb187d07c537b14a16fa3d2f8f7b3e59bda6154669314a410b64deac3b798cd2ac41b7def"' : 'data-bs-target="#xs-injectables-links-module-BusinessRulesModule-65a270562aeb6e17c844520e82d6f34fbcc4d4fda1fb298ac1d1f03eb187d07c537b14a16fa3d2f8f7b3e59bda6154669314a410b64deac3b798cd2ac41b7def"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-BusinessRulesModule-65a270562aeb6e17c844520e82d6f34fbcc4d4fda1fb298ac1d1f03eb187d07c537b14a16fa3d2f8f7b3e59bda6154669314a410b64deac3b798cd2ac41b7def"' :
                                        'id="xs-injectables-links-module-BusinessRulesModule-65a270562aeb6e17c844520e82d6f34fbcc4d4fda1fb298ac1d1f03eb187d07c537b14a16fa3d2f8f7b3e59bda6154669314a410b64deac3b798cd2ac41b7def"' }>
                                        <li class="link">
                                            <a href="injectables/BusinessRulesService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >BusinessRulesService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/CompanyModule.html" data-type="entity-link" >CompanyModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-CompanyModule-475f125c8303dd5ca6e19013f1be760fd4f1df115ff697b330b3b90d5a3577057efc717802803107761f743d5db8eb89a32ffdec7175474a47e943149d0adade"' : 'data-bs-target="#xs-controllers-links-module-CompanyModule-475f125c8303dd5ca6e19013f1be760fd4f1df115ff697b330b3b90d5a3577057efc717802803107761f743d5db8eb89a32ffdec7175474a47e943149d0adade"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-CompanyModule-475f125c8303dd5ca6e19013f1be760fd4f1df115ff697b330b3b90d5a3577057efc717802803107761f743d5db8eb89a32ffdec7175474a47e943149d0adade"' :
                                            'id="xs-controllers-links-module-CompanyModule-475f125c8303dd5ca6e19013f1be760fd4f1df115ff697b330b3b90d5a3577057efc717802803107761f743d5db8eb89a32ffdec7175474a47e943149d0adade"' }>
                                            <li class="link">
                                                <a href="controllers/CompanyController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >CompanyController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-CompanyModule-475f125c8303dd5ca6e19013f1be760fd4f1df115ff697b330b3b90d5a3577057efc717802803107761f743d5db8eb89a32ffdec7175474a47e943149d0adade"' : 'data-bs-target="#xs-injectables-links-module-CompanyModule-475f125c8303dd5ca6e19013f1be760fd4f1df115ff697b330b3b90d5a3577057efc717802803107761f743d5db8eb89a32ffdec7175474a47e943149d0adade"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-CompanyModule-475f125c8303dd5ca6e19013f1be760fd4f1df115ff697b330b3b90d5a3577057efc717802803107761f743d5db8eb89a32ffdec7175474a47e943149d0adade"' :
                                        'id="xs-injectables-links-module-CompanyModule-475f125c8303dd5ca6e19013f1be760fd4f1df115ff697b330b3b90d5a3577057efc717802803107761f743d5db8eb89a32ffdec7175474a47e943149d0adade"' }>
                                        <li class="link">
                                            <a href="injectables/CompanyService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >CompanyService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/ComplianceModule.html" data-type="entity-link" >ComplianceModule</a>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-ComplianceModule-66f75fe6567cde7b53f5e1fdab65abafac9c2eac2055681a76abeca43a80476485decba766c87c24237b9d1f48e04c2be0f044268267d7b34b76d385d06f8dc7"' : 'data-bs-target="#xs-injectables-links-module-ComplianceModule-66f75fe6567cde7b53f5e1fdab65abafac9c2eac2055681a76abeca43a80476485decba766c87c24237b9d1f48e04c2be0f044268267d7b34b76d385d06f8dc7"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-ComplianceModule-66f75fe6567cde7b53f5e1fdab65abafac9c2eac2055681a76abeca43a80476485decba766c87c24237b9d1f48e04c2be0f044268267d7b34b76d385d06f8dc7"' :
                                        'id="xs-injectables-links-module-ComplianceModule-66f75fe6567cde7b53f5e1fdab65abafac9c2eac2055681a76abeca43a80476485decba766c87c24237b9d1f48e04c2be0f044268267d7b34b76d385d06f8dc7"' }>
                                        <li class="link">
                                            <a href="injectables/ComplianceService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ComplianceService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/ContractModule.html" data-type="entity-link" >ContractModule</a>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-ContractModule-1cec26eebd4ee72ef90e4b7270245ad79e6bfd103dedb5a80f13a4a9c5e438b24e957d3fe46a49485936dd280f000e5be5e5f783a868e678240098ea815eac3d"' : 'data-bs-target="#xs-injectables-links-module-ContractModule-1cec26eebd4ee72ef90e4b7270245ad79e6bfd103dedb5a80f13a4a9c5e438b24e957d3fe46a49485936dd280f000e5be5e5f783a868e678240098ea815eac3d"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-ContractModule-1cec26eebd4ee72ef90e4b7270245ad79e6bfd103dedb5a80f13a4a9c5e438b24e957d3fe46a49485936dd280f000e5be5e5f783a868e678240098ea815eac3d"' :
                                        'id="xs-injectables-links-module-ContractModule-1cec26eebd4ee72ef90e4b7270245ad79e6bfd103dedb5a80f13a4a9c5e438b24e957d3fe46a49485936dd280f000e5be5e5f783a868e678240098ea815eac3d"' }>
                                        <li class="link">
                                            <a href="injectables/ContractService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ContractService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/DashboardModule.html" data-type="entity-link" >DashboardModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-DashboardModule-7624e1c007e035a4019ad62f9bf7c28d6458880dde04141d8dad5ca69dcecfd0a8326256dd1e2c306fa0265d645b5a1db4f31a330ad46f3430de78a8a0798bfb"' : 'data-bs-target="#xs-controllers-links-module-DashboardModule-7624e1c007e035a4019ad62f9bf7c28d6458880dde04141d8dad5ca69dcecfd0a8326256dd1e2c306fa0265d645b5a1db4f31a330ad46f3430de78a8a0798bfb"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-DashboardModule-7624e1c007e035a4019ad62f9bf7c28d6458880dde04141d8dad5ca69dcecfd0a8326256dd1e2c306fa0265d645b5a1db4f31a330ad46f3430de78a8a0798bfb"' :
                                            'id="xs-controllers-links-module-DashboardModule-7624e1c007e035a4019ad62f9bf7c28d6458880dde04141d8dad5ca69dcecfd0a8326256dd1e2c306fa0265d645b5a1db4f31a330ad46f3430de78a8a0798bfb"' }>
                                            <li class="link">
                                                <a href="controllers/DashboardController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DashboardController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-DashboardModule-7624e1c007e035a4019ad62f9bf7c28d6458880dde04141d8dad5ca69dcecfd0a8326256dd1e2c306fa0265d645b5a1db4f31a330ad46f3430de78a8a0798bfb"' : 'data-bs-target="#xs-injectables-links-module-DashboardModule-7624e1c007e035a4019ad62f9bf7c28d6458880dde04141d8dad5ca69dcecfd0a8326256dd1e2c306fa0265d645b5a1db4f31a330ad46f3430de78a8a0798bfb"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-DashboardModule-7624e1c007e035a4019ad62f9bf7c28d6458880dde04141d8dad5ca69dcecfd0a8326256dd1e2c306fa0265d645b5a1db4f31a330ad46f3430de78a8a0798bfb"' :
                                        'id="xs-injectables-links-module-DashboardModule-7624e1c007e035a4019ad62f9bf7c28d6458880dde04141d8dad5ca69dcecfd0a8326256dd1e2c306fa0265d645b5a1db4f31a330ad46f3430de78a8a0798bfb"' }>
                                        <li class="link">
                                            <a href="injectables/AnalyticsService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AnalyticsService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/DashboardService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DashboardService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/DfeModule.html" data-type="entity-link" >DfeModule</a>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-DfeModule-8ef47968bfe828572027d345a59003cc4a07ff18c3f771836cfc8509d3c6e606b86eb177b099a6dde620f1e698f7b99a9e077783d256153fc00c57ad08e61b32"' : 'data-bs-target="#xs-injectables-links-module-DfeModule-8ef47968bfe828572027d345a59003cc4a07ff18c3f771836cfc8509d3c6e606b86eb177b099a6dde620f1e698f7b99a9e077783d256153fc00c57ad08e61b32"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-DfeModule-8ef47968bfe828572027d345a59003cc4a07ff18c3f771836cfc8509d3c6e606b86eb177b099a6dde620f1e698f7b99a9e077783d256153fc00c57ad08e61b32"' :
                                        'id="xs-injectables-links-module-DfeModule-8ef47968bfe828572027d345a59003cc4a07ff18c3f771836cfc8509d3c6e606b86eb177b099a6dde620f1e698f7b99a9e077783d256153fc00c57ad08e61b32"' }>
                                        <li class="link">
                                            <a href="injectables/DfeService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DfeService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/FinanceModule.html" data-type="entity-link" >FinanceModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-FinanceModule-89b14ea6a69200fd386da577a62b6932fc5455761043d1cef20800179ce09c38834db2d1c4eefa234212f259957bf63a9f4f50e07251bf0e2f2e8bc0891f20a2"' : 'data-bs-target="#xs-controllers-links-module-FinanceModule-89b14ea6a69200fd386da577a62b6932fc5455761043d1cef20800179ce09c38834db2d1c4eefa234212f259957bf63a9f4f50e07251bf0e2f2e8bc0891f20a2"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-FinanceModule-89b14ea6a69200fd386da577a62b6932fc5455761043d1cef20800179ce09c38834db2d1c4eefa234212f259957bf63a9f4f50e07251bf0e2f2e8bc0891f20a2"' :
                                            'id="xs-controllers-links-module-FinanceModule-89b14ea6a69200fd386da577a62b6932fc5455761043d1cef20800179ce09c38834db2d1c4eefa234212f259957bf63a9f4f50e07251bf0e2f2e8bc0891f20a2"' }>
                                            <li class="link">
                                                <a href="controllers/FinanceController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FinanceController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-FinanceModule-89b14ea6a69200fd386da577a62b6932fc5455761043d1cef20800179ce09c38834db2d1c4eefa234212f259957bf63a9f4f50e07251bf0e2f2e8bc0891f20a2"' : 'data-bs-target="#xs-injectables-links-module-FinanceModule-89b14ea6a69200fd386da577a62b6932fc5455761043d1cef20800179ce09c38834db2d1c4eefa234212f259957bf63a9f4f50e07251bf0e2f2e8bc0891f20a2"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-FinanceModule-89b14ea6a69200fd386da577a62b6932fc5455761043d1cef20800179ce09c38834db2d1c4eefa234212f259957bf63a9f4f50e07251bf0e2f2e8bc0891f20a2"' :
                                        'id="xs-injectables-links-module-FinanceModule-89b14ea6a69200fd386da577a62b6932fc5455761043d1cef20800179ce09c38834db2d1c4eefa234212f259957bf63a9f4f50e07251bf0e2f2e8bc0891f20a2"' }>
                                        <li class="link">
                                            <a href="injectables/FinanceService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FinanceService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/FiscalModule.html" data-type="entity-link" >FiscalModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-FiscalModule-7fa315e953f4838ea5573ef6f2762248660b9dadbaccfa70fed392f79d952db9fc3f91d262904154d1cc5f7fa7ea82f85d6271cff3f3f37f032594f0627f8d59"' : 'data-bs-target="#xs-controllers-links-module-FiscalModule-7fa315e953f4838ea5573ef6f2762248660b9dadbaccfa70fed392f79d952db9fc3f91d262904154d1cc5f7fa7ea82f85d6271cff3f3f37f032594f0627f8d59"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-FiscalModule-7fa315e953f4838ea5573ef6f2762248660b9dadbaccfa70fed392f79d952db9fc3f91d262904154d1cc5f7fa7ea82f85d6271cff3f3f37f032594f0627f8d59"' :
                                            'id="xs-controllers-links-module-FiscalModule-7fa315e953f4838ea5573ef6f2762248660b9dadbaccfa70fed392f79d952db9fc3f91d262904154d1cc5f7fa7ea82f85d6271cff3f3f37f032594f0627f8d59"' }>
                                            <li class="link">
                                                <a href="controllers/FiscalController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FiscalController</a>
                                            </li>
                                            <li class="link">
                                                <a href="controllers/PayrollController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >PayrollController</a>
                                            </li>
                                            <li class="link">
                                                <a href="controllers/TaxController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TaxController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-FiscalModule-7fa315e953f4838ea5573ef6f2762248660b9dadbaccfa70fed392f79d952db9fc3f91d262904154d1cc5f7fa7ea82f85d6271cff3f3f37f032594f0627f8d59"' : 'data-bs-target="#xs-injectables-links-module-FiscalModule-7fa315e953f4838ea5573ef6f2762248660b9dadbaccfa70fed392f79d952db9fc3f91d262904154d1cc5f7fa7ea82f85d6271cff3f3f37f032594f0627f8d59"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-FiscalModule-7fa315e953f4838ea5573ef6f2762248660b9dadbaccfa70fed392f79d952db9fc3f91d262904154d1cc5f7fa7ea82f85d6271cff3f3f37f032594f0627f8d59"' :
                                        'id="xs-injectables-links-module-FiscalModule-7fa315e953f4838ea5573ef6f2762248660b9dadbaccfa70fed392f79d952db9fc3f91d262904154d1cc5f7fa7ea82f85d6271cff3f3f37f032594f0627f8d59"' }>
                                        <li class="link">
                                            <a href="injectables/ComplianceService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ComplianceService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/DfeProcessorService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DfeProcessorService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/DfeService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DfeService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/FiscalCronService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FiscalCronService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/FiscalSeedService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FiscalSeedService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/FiscalService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FiscalService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/InvoiceService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >InvoiceService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/PayrollService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >PayrollService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/ReportService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ReportService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/TaxCalculationService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TaxCalculationService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/TaxService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TaxService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/XmlService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >XmlService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/HealthModule.html" data-type="entity-link" >HealthModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-HealthModule-2db2e08d5ee49d0def79fcc812ab6743be57ebd8fe8232e9289265f4a96baf3f1321bebb6dc23fe112215d57f4c6d7cf64cccea075c87b6b241455aa0a389cad"' : 'data-bs-target="#xs-controllers-links-module-HealthModule-2db2e08d5ee49d0def79fcc812ab6743be57ebd8fe8232e9289265f4a96baf3f1321bebb6dc23fe112215d57f4c6d7cf64cccea075c87b6b241455aa0a389cad"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-HealthModule-2db2e08d5ee49d0def79fcc812ab6743be57ebd8fe8232e9289265f4a96baf3f1321bebb6dc23fe112215d57f4c6d7cf64cccea075c87b6b241455aa0a389cad"' :
                                            'id="xs-controllers-links-module-HealthModule-2db2e08d5ee49d0def79fcc812ab6743be57ebd8fe8232e9289265f4a96baf3f1321bebb6dc23fe112215d57f4c6d7cf64cccea075c87b6b241455aa0a389cad"' }>
                                            <li class="link">
                                                <a href="controllers/HealthController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >HealthController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-HealthModule-2db2e08d5ee49d0def79fcc812ab6743be57ebd8fe8232e9289265f4a96baf3f1321bebb6dc23fe112215d57f4c6d7cf64cccea075c87b6b241455aa0a389cad"' : 'data-bs-target="#xs-injectables-links-module-HealthModule-2db2e08d5ee49d0def79fcc812ab6743be57ebd8fe8232e9289265f4a96baf3f1321bebb6dc23fe112215d57f4c6d7cf64cccea075c87b6b241455aa0a389cad"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-HealthModule-2db2e08d5ee49d0def79fcc812ab6743be57ebd8fe8232e9289265f4a96baf3f1321bebb6dc23fe112215d57f4c6d7cf64cccea075c87b6b241455aa0a389cad"' :
                                        'id="xs-injectables-links-module-HealthModule-2db2e08d5ee49d0def79fcc812ab6743be57ebd8fe8232e9289265f4a96baf3f1321bebb6dc23fe112215d57f4c6d7cf64cccea075c87b6b241455aa0a389cad"' }>
                                        <li class="link">
                                            <a href="injectables/CompanyCacheInterceptor.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >CompanyCacheInterceptor</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/ExternalNotifierService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ExternalNotifierService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/HealthService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >HealthService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/PerformanceAuditService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >PerformanceAuditService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/InsightsModule.html" data-type="entity-link" >InsightsModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-InsightsModule-639681231662a5078e49af9da297451c4eb0ee6093367e37d0b9c8552c4c82b28a7d3693777aef30c1af43a0238e99892e9c0f02f92081c9e002dc6a31052720"' : 'data-bs-target="#xs-controllers-links-module-InsightsModule-639681231662a5078e49af9da297451c4eb0ee6093367e37d0b9c8552c4c82b28a7d3693777aef30c1af43a0238e99892e9c0f02f92081c9e002dc6a31052720"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-InsightsModule-639681231662a5078e49af9da297451c4eb0ee6093367e37d0b9c8552c4c82b28a7d3693777aef30c1af43a0238e99892e9c0f02f92081c9e002dc6a31052720"' :
                                            'id="xs-controllers-links-module-InsightsModule-639681231662a5078e49af9da297451c4eb0ee6093367e37d0b9c8552c4c82b28a7d3693777aef30c1af43a0238e99892e9c0f02f92081c9e002dc6a31052720"' }>
                                            <li class="link">
                                                <a href="controllers/InsightsController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >InsightsController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-InsightsModule-639681231662a5078e49af9da297451c4eb0ee6093367e37d0b9c8552c4c82b28a7d3693777aef30c1af43a0238e99892e9c0f02f92081c9e002dc6a31052720"' : 'data-bs-target="#xs-injectables-links-module-InsightsModule-639681231662a5078e49af9da297451c4eb0ee6093367e37d0b9c8552c4c82b28a7d3693777aef30c1af43a0238e99892e9c0f02f92081c9e002dc6a31052720"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-InsightsModule-639681231662a5078e49af9da297451c4eb0ee6093367e37d0b9c8552c4c82b28a7d3693777aef30c1af43a0238e99892e9c0f02f92081c9e002dc6a31052720"' :
                                        'id="xs-injectables-links-module-InsightsModule-639681231662a5078e49af9da297451c4eb0ee6093367e37d0b9c8552c4c82b28a7d3693777aef30c1af43a0238e99892e9c0f02f92081c9e002dc6a31052720"' }>
                                        <li class="link">
                                            <a href="injectables/AdvisoryService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AdvisoryService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/AnomalyDetectionService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AnomalyDetectionService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/CashFlowProjectionService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >CashFlowProjectionService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/InsightsCronService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >InsightsCronService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/InsightsService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >InsightsService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/NotificationModule.html" data-type="entity-link" >NotificationModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-NotificationModule-43eca072c5cf398dc23a48b0e1fa93db5b71ad76dceb1b96768b9e8b9da0fe0d99175e0be1dd659c25d285e076d1058ae9037a296772facd1221acfd9974efb6"' : 'data-bs-target="#xs-controllers-links-module-NotificationModule-43eca072c5cf398dc23a48b0e1fa93db5b71ad76dceb1b96768b9e8b9da0fe0d99175e0be1dd659c25d285e076d1058ae9037a296772facd1221acfd9974efb6"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-NotificationModule-43eca072c5cf398dc23a48b0e1fa93db5b71ad76dceb1b96768b9e8b9da0fe0d99175e0be1dd659c25d285e076d1058ae9037a296772facd1221acfd9974efb6"' :
                                            'id="xs-controllers-links-module-NotificationModule-43eca072c5cf398dc23a48b0e1fa93db5b71ad76dceb1b96768b9e8b9da0fe0d99175e0be1dd659c25d285e076d1058ae9037a296772facd1221acfd9974efb6"' }>
                                            <li class="link">
                                                <a href="controllers/NotificationController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >NotificationController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-NotificationModule-43eca072c5cf398dc23a48b0e1fa93db5b71ad76dceb1b96768b9e8b9da0fe0d99175e0be1dd659c25d285e076d1058ae9037a296772facd1221acfd9974efb6"' : 'data-bs-target="#xs-injectables-links-module-NotificationModule-43eca072c5cf398dc23a48b0e1fa93db5b71ad76dceb1b96768b9e8b9da0fe0d99175e0be1dd659c25d285e076d1058ae9037a296772facd1221acfd9974efb6"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-NotificationModule-43eca072c5cf398dc23a48b0e1fa93db5b71ad76dceb1b96768b9e8b9da0fe0d99175e0be1dd659c25d285e076d1058ae9037a296772facd1221acfd9974efb6"' :
                                        'id="xs-injectables-links-module-NotificationModule-43eca072c5cf398dc23a48b0e1fa93db5b71ad76dceb1b96768b9e8b9da0fe0d99175e0be1dd659c25d285e076d1058ae9037a296772facd1221acfd9974efb6"' }>
                                        <li class="link">
                                            <a href="injectables/NotificationPrismaService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >NotificationPrismaService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/NotificationService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >NotificationService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/PrismaModule.html" data-type="entity-link" >PrismaModule</a>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-PrismaModule-a6b328df749801bbd875a0a6b08571a0e568dc9061068ee73d80cc5eb4c9f23ffa81a0256454aa48038393804e65bfbfa2b4fd576a7e6fc8a16c08c0331f5b28"' : 'data-bs-target="#xs-injectables-links-module-PrismaModule-a6b328df749801bbd875a0a6b08571a0e568dc9061068ee73d80cc5eb4c9f23ffa81a0256454aa48038393804e65bfbfa2b4fd576a7e6fc8a16c08c0331f5b28"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-PrismaModule-a6b328df749801bbd875a0a6b08571a0e568dc9061068ee73d80cc5eb4c9f23ffa81a0256454aa48038393804e65bfbfa2b4fd576a7e6fc8a16c08c0331f5b28"' :
                                        'id="xs-injectables-links-module-PrismaModule-a6b328df749801bbd875a0a6b08571a0e568dc9061068ee73d80cc5eb4c9f23ffa81a0256454aa48038393804e65bfbfa2b4fd576a7e6fc8a16c08c0331f5b28"' }>
                                        <li class="link">
                                            <a href="injectables/PrismaService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >PrismaService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/ReconciliationModule.html" data-type="entity-link" >ReconciliationModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-ReconciliationModule-26e5b8325b26bbdf5b6b8e91bf07f1ca16b36e05ea50a91a2c8c9fc4967d7680d8ea77d27a6dd0e14cdb96ccc746bf761decd7a2a517b5e95b4f2474e72f0c2b"' : 'data-bs-target="#xs-controllers-links-module-ReconciliationModule-26e5b8325b26bbdf5b6b8e91bf07f1ca16b36e05ea50a91a2c8c9fc4967d7680d8ea77d27a6dd0e14cdb96ccc746bf761decd7a2a517b5e95b4f2474e72f0c2b"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-ReconciliationModule-26e5b8325b26bbdf5b6b8e91bf07f1ca16b36e05ea50a91a2c8c9fc4967d7680d8ea77d27a6dd0e14cdb96ccc746bf761decd7a2a517b5e95b4f2474e72f0c2b"' :
                                            'id="xs-controllers-links-module-ReconciliationModule-26e5b8325b26bbdf5b6b8e91bf07f1ca16b36e05ea50a91a2c8c9fc4967d7680d8ea77d27a6dd0e14cdb96ccc746bf761decd7a2a517b5e95b4f2474e72f0c2b"' }>
                                            <li class="link">
                                                <a href="controllers/ReconciliationController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ReconciliationController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-ReconciliationModule-26e5b8325b26bbdf5b6b8e91bf07f1ca16b36e05ea50a91a2c8c9fc4967d7680d8ea77d27a6dd0e14cdb96ccc746bf761decd7a2a517b5e95b4f2474e72f0c2b"' : 'data-bs-target="#xs-injectables-links-module-ReconciliationModule-26e5b8325b26bbdf5b6b8e91bf07f1ca16b36e05ea50a91a2c8c9fc4967d7680d8ea77d27a6dd0e14cdb96ccc746bf761decd7a2a517b5e95b4f2474e72f0c2b"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-ReconciliationModule-26e5b8325b26bbdf5b6b8e91bf07f1ca16b36e05ea50a91a2c8c9fc4967d7680d8ea77d27a6dd0e14cdb96ccc746bf761decd7a2a517b5e95b4f2474e72f0c2b"' :
                                        'id="xs-injectables-links-module-ReconciliationModule-26e5b8325b26bbdf5b6b8e91bf07f1ca16b36e05ea50a91a2c8c9fc4967d7680d8ea77d27a6dd0e14cdb96ccc746bf761decd7a2a517b5e95b4f2474e72f0c2b"' }>
                                        <li class="link">
                                            <a href="injectables/ReconciliationService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ReconciliationService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/RevenueModule.html" data-type="entity-link" >RevenueModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-RevenueModule-45a53a761cda1dfafe0549a73fdb6bfb1fe5af0c5d446012e0dc0c7f3f992e5301bb2460ca265e944e881b37f84cb0883aa6cd67580a50275b0413101bdd6cda"' : 'data-bs-target="#xs-controllers-links-module-RevenueModule-45a53a761cda1dfafe0549a73fdb6bfb1fe5af0c5d446012e0dc0c7f3f992e5301bb2460ca265e944e881b37f84cb0883aa6cd67580a50275b0413101bdd6cda"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-RevenueModule-45a53a761cda1dfafe0549a73fdb6bfb1fe5af0c5d446012e0dc0c7f3f992e5301bb2460ca265e944e881b37f84cb0883aa6cd67580a50275b0413101bdd6cda"' :
                                            'id="xs-controllers-links-module-RevenueModule-45a53a761cda1dfafe0549a73fdb6bfb1fe5af0c5d446012e0dc0c7f3f992e5301bb2460ca265e944e881b37f84cb0883aa6cd67580a50275b0413101bdd6cda"' }>
                                            <li class="link">
                                                <a href="controllers/RevenueController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RevenueController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-RevenueModule-45a53a761cda1dfafe0549a73fdb6bfb1fe5af0c5d446012e0dc0c7f3f992e5301bb2460ca265e944e881b37f84cb0883aa6cd67580a50275b0413101bdd6cda"' : 'data-bs-target="#xs-injectables-links-module-RevenueModule-45a53a761cda1dfafe0549a73fdb6bfb1fe5af0c5d446012e0dc0c7f3f992e5301bb2460ca265e944e881b37f84cb0883aa6cd67580a50275b0413101bdd6cda"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-RevenueModule-45a53a761cda1dfafe0549a73fdb6bfb1fe5af0c5d446012e0dc0c7f3f992e5301bb2460ca265e944e881b37f84cb0883aa6cd67580a50275b0413101bdd6cda"' :
                                        'id="xs-injectables-links-module-RevenueModule-45a53a761cda1dfafe0549a73fdb6bfb1fe5af0c5d446012e0dc0c7f3f992e5301bb2460ca265e944e881b37f84cb0883aa6cd67580a50275b0413101bdd6cda"' }>
                                        <li class="link">
                                            <a href="injectables/CalculateFactorRUseCase.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >CalculateFactorRUseCase</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/CloseMonthUseCase.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >CloseMonthUseCase</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/RevenueRepository.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RevenueRepository</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/RevenueService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RevenueService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                </ul>
                </li>
                        <li class="chapter">
                            <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#controllers-links"' :
                                'data-bs-target="#xs-controllers-links"' }>
                                <span class="icon ion-md-swap"></span>
                                <span>Controllers</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                            <ul class="links collapse " ${ isNormalMode ? 'id="controllers-links"' : 'id="xs-controllers-links"' }>
                                <li class="link">
                                    <a href="controllers/AppController.html" data-type="entity-link" >AppController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/AuthController.html" data-type="entity-link" >AuthController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/AutomationController.html" data-type="entity-link" >AutomationController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/BankingController.html" data-type="entity-link" >BankingController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/BillingController.html" data-type="entity-link" >BillingController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/BusinessRulesController.html" data-type="entity-link" >BusinessRulesController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/CompanyController.html" data-type="entity-link" >CompanyController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/ComplianceController.html" data-type="entity-link" >ComplianceController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/DashboardController.html" data-type="entity-link" >DashboardController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/DashboardController-1.html" data-type="entity-link" >DashboardController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/DfeController.html" data-type="entity-link" >DfeController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/FinanceController.html" data-type="entity-link" >FinanceController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/FiscalController.html" data-type="entity-link" >FiscalController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/HealthController.html" data-type="entity-link" >HealthController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/InsightsController.html" data-type="entity-link" >InsightsController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/NotificationController.html" data-type="entity-link" >NotificationController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/PayrollController.html" data-type="entity-link" >PayrollController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/ReconciliationController.html" data-type="entity-link" >ReconciliationController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/RevenueController.html" data-type="entity-link" >RevenueController</a>
                                </li>
                                <li class="link">
                                    <a href="controllers/TaxController.html" data-type="entity-link" >TaxController</a>
                                </li>
                            </ul>
                        </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#classes-links"' :
                            'data-bs-target="#xs-classes-links"' }>
                            <span class="icon ion-ios-paper"></span>
                            <span>Classes</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="classes-links"' : 'id="xs-classes-links"' }>
                            <li class="link">
                                <a href="classes/AnomalyReportDto.html" data-type="entity-link" >AnomalyReportDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/AuditLogEvent.html" data-type="entity-link" >AuditLogEvent</a>
                            </li>
                            <li class="link">
                                <a href="classes/CreateBusinessRuleDto.html" data-type="entity-link" >CreateBusinessRuleDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/CreateCompanyDto.html" data-type="entity-link" >CreateCompanyDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/CreateFinancialEventDto.html" data-type="entity-link" >CreateFinancialEventDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/CreateInvoiceDto.html" data-type="entity-link" >CreateInvoiceDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/CreateInvoiceDto-1.html" data-type="entity-link" >CreateInvoiceDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/CreatePayrollDto.html" data-type="entity-link" >CreatePayrollDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/CreatePayrollDto-1.html" data-type="entity-link" >CreatePayrollDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/CreatePayrollDto-2.html" data-type="entity-link" >CreatePayrollDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/CreateRevenueDto.html" data-type="entity-link" >CreateRevenueDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/DfeProcessor.html" data-type="entity-link" >DfeProcessor</a>
                            </li>
                            <li class="link">
                                <a href="classes/FactorRResponseDto.html" data-type="entity-link" >FactorRResponseDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/FinanceProcessor.html" data-type="entity-link" >FinanceProcessor</a>
                            </li>
                            <li class="link">
                                <a href="classes/FinancialHealthDto.html" data-type="entity-link" >FinancialHealthDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/FinancialHealthFactorsDto.html" data-type="entity-link" >FinancialHealthFactorsDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/GetMetricsDto.html" data-type="entity-link" >GetMetricsDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/GlobalExceptionFilter.html" data-type="entity-link" >GlobalExceptionFilter</a>
                            </li>
                            <li class="link">
                                <a href="classes/HttpExceptionFilter.html" data-type="entity-link" >HttpExceptionFilter</a>
                            </li>
                            <li class="link">
                                <a href="classes/ImportOfxDto.html" data-type="entity-link" >ImportOfxDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/LoginDto.html" data-type="entity-link" >LoginDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/ManualMatchDto.html" data-type="entity-link" >ManualMatchDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/NotificationGateway.html" data-type="entity-link" >NotificationGateway</a>
                            </li>
                            <li class="link">
                                <a href="classes/ProcessBillingParamsDto.html" data-type="entity-link" >ProcessBillingParamsDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/ReconciliationProcessor.html" data-type="entity-link" >ReconciliationProcessor</a>
                            </li>
                            <li class="link">
                                <a href="classes/ReconciliationQueryDto.html" data-type="entity-link" >ReconciliationQueryDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/ReconciliationScoreEngine.html" data-type="entity-link" >ReconciliationScoreEngine</a>
                            </li>
                            <li class="link">
                                <a href="classes/ReconciliationWhereBuilder.html" data-type="entity-link" >ReconciliationWhereBuilder</a>
                            </li>
                            <li class="link">
                                <a href="classes/RegisterDto.html" data-type="entity-link" >RegisterDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/RevenueMetricsResponseDto.html" data-type="entity-link" >RevenueMetricsResponseDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/RevenueRepository.html" data-type="entity-link" >RevenueRepository</a>
                            </li>
                            <li class="link">
                                <a href="classes/SimulationDto.html" data-type="entity-link" >SimulationDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/SwitchCompanyDto.html" data-type="entity-link" >SwitchCompanyDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/TenantContext.html" data-type="entity-link" >TenantContext</a>
                            </li>
                            <li class="link">
                                <a href="classes/UpdateBusinessRuleDto.html" data-type="entity-link" >UpdateBusinessRuleDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/UpdateCompanyDto.html" data-type="entity-link" >UpdateCompanyDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/UploadXmlDto.html" data-type="entity-link" >UploadXmlDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/XmlExtractionProcessor.html" data-type="entity-link" >XmlExtractionProcessor</a>
                            </li>
                            <li class="link">
                                <a href="classes/XmlExtractionProcessor-1.html" data-type="entity-link" >XmlExtractionProcessor</a>
                            </li>
                            <li class="link">
                                <a href="classes/XmlProcessor.html" data-type="entity-link" >XmlProcessor</a>
                            </li>
                            <li class="link">
                                <a href="classes/XmlProcessorConsumer.html" data-type="entity-link" >XmlProcessorConsumer</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#injectables-links"' :
                                'data-bs-target="#xs-injectables-links"' }>
                                <span class="icon ion-md-arrow-round-down"></span>
                                <span>Injectables</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                            <ul class="links collapse " ${ isNormalMode ? 'id="injectables-links"' : 'id="xs-injectables-links"' }>
                                <li class="link">
                                    <a href="injectables/AdvisoryService.html" data-type="entity-link" >AdvisoryService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/AlertService.html" data-type="entity-link" >AlertService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/AnalyticsService.html" data-type="entity-link" >AnalyticsService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/AnomalyDetectionService.html" data-type="entity-link" >AnomalyDetectionService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/AnomalyDetectionService-1.html" data-type="entity-link" >AnomalyDetectionService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/AppService.html" data-type="entity-link" >AppService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/AuditLogInterceptor.html" data-type="entity-link" >AuditLogInterceptor</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/AuditLogListener.html" data-type="entity-link" >AuditLogListener</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/AuthService.html" data-type="entity-link" >AuthService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/AutomationJobService.html" data-type="entity-link" >AutomationJobService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/AutomationService.html" data-type="entity-link" >AutomationService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/BankingRepository.html" data-type="entity-link" >BankingRepository</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/BankingService.html" data-type="entity-link" >BankingService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/BusinessRulesService.html" data-type="entity-link" >BusinessRulesService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/CalculateFactorRUseCase.html" data-type="entity-link" >CalculateFactorRUseCase</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/CashFlowProjectionService.html" data-type="entity-link" >CashFlowProjectionService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/CashFlowService.html" data-type="entity-link" >CashFlowService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/CloseMonthUseCase.html" data-type="entity-link" >CloseMonthUseCase</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/CompanyCacheInterceptor.html" data-type="entity-link" >CompanyCacheInterceptor</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/CompanyService.html" data-type="entity-link" >CompanyService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ComplianceService.html" data-type="entity-link" >ComplianceService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ContextMiddleware.html" data-type="entity-link" >ContextMiddleware</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ContractService.html" data-type="entity-link" >ContractService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ContractService-1.html" data-type="entity-link" >ContractService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/DashboardService.html" data-type="entity-link" >DashboardService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/DashboardService-1.html" data-type="entity-link" >DashboardService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/DfeProcessorService.html" data-type="entity-link" >DfeProcessorService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/DfeService.html" data-type="entity-link" >DfeService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ExternalNotifierService.html" data-type="entity-link" >ExternalNotifierService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/FactorREngineService.html" data-type="entity-link" >FactorREngineService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/FinanceService.html" data-type="entity-link" >FinanceService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/FinancialLedgerService.html" data-type="entity-link" >FinancialLedgerService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/FiscalCronService.html" data-type="entity-link" >FiscalCronService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/FiscalSeedService.html" data-type="entity-link" >FiscalSeedService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/FiscalService.html" data-type="entity-link" >FiscalService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ForecastingService.html" data-type="entity-link" >ForecastingService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/HealthService.html" data-type="entity-link" >HealthService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ImportService.html" data-type="entity-link" >ImportService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/InsightsCronService.html" data-type="entity-link" >InsightsCronService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/InsightsCronService-1.html" data-type="entity-link" >InsightsCronService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/InsightsService.html" data-type="entity-link" >InsightsService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/InvoiceService.html" data-type="entity-link" >InvoiceService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/JwtAuthGuard.html" data-type="entity-link" >JwtAuthGuard</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/JwtStrategy.html" data-type="entity-link" >JwtStrategy</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/LoggingInterceptor.html" data-type="entity-link" >LoggingInterceptor</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/NotificationPrismaService.html" data-type="entity-link" >NotificationPrismaService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/NotificationService.html" data-type="entity-link" >NotificationService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/PayrollService.html" data-type="entity-link" >PayrollService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/PerformanceAuditService.html" data-type="entity-link" >PerformanceAuditService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/PrismaRevenueRepository.html" data-type="entity-link" >PrismaRevenueRepository</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/PrismaService.html" data-type="entity-link" >PrismaService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ReconciliationService.html" data-type="entity-link" >ReconciliationService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ReconciliationService-1.html" data-type="entity-link" >ReconciliationService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ReportService.html" data-type="entity-link" >ReportService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/RevenueRepository.html" data-type="entity-link" >RevenueRepository</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/RevenueService.html" data-type="entity-link" >RevenueService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/RuleEngineService.html" data-type="entity-link" >RuleEngineService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/TaxCalculationService.html" data-type="entity-link" >TaxCalculationService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/TaxComplianceService.html" data-type="entity-link" >TaxComplianceService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/TaxObligationService.html" data-type="entity-link" >TaxObligationService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/TaxService.html" data-type="entity-link" >TaxService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/TenantMiddleware.html" data-type="entity-link" >TenantMiddleware</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/XmlService.html" data-type="entity-link" >XmlService</a>
                                </li>
                            </ul>
                        </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#guards-links"' :
                            'data-bs-target="#xs-guards-links"' }>
                            <span class="icon ion-ios-lock"></span>
                            <span>Guards</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="guards-links"' : 'id="xs-guards-links"' }>
                            <li class="link">
                                <a href="guards/CompanyAccessGuard.html" data-type="entity-link" >CompanyAccessGuard</a>
                            </li>
                            <li class="link">
                                <a href="guards/RolesGuard.html" data-type="entity-link" >RolesGuard</a>
                            </li>
                            <li class="link">
                                <a href="guards/TenantContextGuard.html" data-type="entity-link" >TenantContextGuard</a>
                            </li>
                            <li class="link">
                                <a href="guards/WsJwtGuard.html" data-type="entity-link" >WsJwtGuard</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#interfaces-links"' :
                            'data-bs-target="#xs-interfaces-links"' }>
                            <span class="icon ion-md-information-circle-outline"></span>
                            <span>Interfaces</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? ' id="interfaces-links"' : 'id="xs-interfaces-links"' }>
                            <li class="link">
                                <a href="interfaces/AdvisoryReport.html" data-type="entity-link" >AdvisoryReport</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/AnomalyReport.html" data-type="entity-link" >AnomalyReport</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/AppContext.html" data-type="entity-link" >AppContext</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/AuthenticatedUser.html" data-type="entity-link" >AuthenticatedUser</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/AuthUser.html" data-type="entity-link" >AuthUser</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/BillingCycleResult.html" data-type="entity-link" >BillingCycleResult</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/BillingCycleResult-1.html" data-type="entity-link" >BillingCycleResult</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/BillingDetail.html" data-type="entity-link" >BillingDetail</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/BillingDetail-1.html" data-type="entity-link" >BillingDetail</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CapturedDocument.html" data-type="entity-link" >CapturedDocument</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ComplianceIssue.html" data-type="entity-link" >ComplianceIssue</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ComplianceReport.html" data-type="entity-link" >ComplianceReport</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/DbHealth.html" data-type="entity-link" >DbHealth</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/DbPerformanceMetric.html" data-type="entity-link" >DbPerformanceMetric</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/FactorRResult.html" data-type="entity-link" >FactorRResult</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/FactorRResult-1.html" data-type="entity-link" >FactorRResult</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/FinancialHealth.html" data-type="entity-link" >FinancialHealth</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/FiscalHealthScore.html" data-type="entity-link" >FiscalHealthScore</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/HealthMetricsResponse.html" data-type="entity-link" >HealthMetricsResponse</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/IAnomalyAlert.html" data-type="entity-link" >IAnomalyAlert</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/InvoiceGap.html" data-type="entity-link" >InvoiceGap</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/InvoiceScoreInput.html" data-type="entity-link" >InvoiceScoreInput</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/InvoiceSeedData.html" data-type="entity-link" >InvoiceSeedData</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/JwtPayload.html" data-type="entity-link" >JwtPayload</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/JwtSignPayload.html" data-type="entity-link" >JwtSignPayload</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/LoginResponse.html" data-type="entity-link" >LoginResponse</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ManualMatchOptions.html" data-type="entity-link" >ManualMatchOptions</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/MonthlyReportOutput.html" data-type="entity-link" >MonthlyReportOutput</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/NormalizedInvoiceData.html" data-type="entity-link" >NormalizedInvoiceData</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/NotificationDispatchResult.html" data-type="entity-link" >NotificationDispatchResult</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PayrollSeedData.html" data-type="entity-link" >PayrollSeedData</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ReconciliationMatch.html" data-type="entity-link" >ReconciliationMatch</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ReconciliationScoreInput.html" data-type="entity-link" >ReconciliationScoreInput</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/RegisterInput.html" data-type="entity-link" >RegisterInput</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/RegisterResponse.html" data-type="entity-link" >RegisterResponse</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ScoreBreakdown.html" data-type="entity-link" >ScoreBreakdown</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/SeedRecord.html" data-type="entity-link" >SeedRecord</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/SwitchCompanyResponse.html" data-type="entity-link" >SwitchCompanyResponse</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/TaxAdvisory.html" data-type="entity-link" >TaxAdvisory</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/TaxAuditEvent.html" data-type="entity-link" >TaxAuditEvent</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/TaxCalculationResult.html" data-type="entity-link" >TaxCalculationResult</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/TenantStore.html" data-type="entity-link" >TenantStore</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/TransactionScoreInput.html" data-type="entity-link" >TransactionScoreInput</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/TransactionSeedData.html" data-type="entity-link" >TransactionSeedData</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/XmlJobData.html" data-type="entity-link" >XmlJobData</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#miscellaneous-links"'
                            : 'data-bs-target="#xs-miscellaneous-links"' }>
                            <span class="icon ion-ios-cube"></span>
                            <span>Miscellaneous</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="miscellaneous-links"' : 'id="xs-miscellaneous-links"' }>
                            <li class="link">
                                <a href="miscellaneous/enumerations.html" data-type="entity-link">Enums</a>
                            </li>
                            <li class="link">
                                <a href="miscellaneous/functions.html" data-type="entity-link">Functions</a>
                            </li>
                            <li class="link">
                                <a href="miscellaneous/typealiases.html" data-type="entity-link">Type aliases</a>
                            </li>
                            <li class="link">
                                <a href="miscellaneous/variables.html" data-type="entity-link">Variables</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <a data-type="chapter-link" href="routes.html"><span class="icon ion-ios-git-branch"></span>Routes</a>
                        </li>
                    <li class="chapter">
                        <a data-type="chapter-link" href="coverage.html"><span class="icon ion-ios-stats"></span>Documentation coverage</a>
                    </li>
                    <li class="divider"></li>
                    <li class="copyright">
                        Documentation generated using <a href="https://compodoc.app/" target="_blank" rel="noopener noreferrer">
                            <img data-src="images/compodoc-vectorise.png" class="img-responsive" data-type="compodoc-logo">
                        </a>
                    </li>
            </ul>
        </nav>
        `);
        this.innerHTML = tp.strings;
    }
});