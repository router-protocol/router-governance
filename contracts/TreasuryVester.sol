pragma solidity >=0.6.0;

import "./SafeMath.sol";

contract TreasuryVester {
    using SafeMath for uint;

    address public route;
    address public recipient;
    address public factory;
    uint public vestingAmount;
    uint public vestingBegin;
    uint public vestingCliff;
    uint public vestingEnd;
    uint public bonus;
    uint public lastUpdate;

    constructor (
        address factory_,
        address route_,
        address recipient_,
        uint vestingAmount_,
        uint vestingCliff_,
        uint vestingEnd_,
        uint bonus_
    ) public {
        require(vestingCliff_ >= block.timestamp, 'TreasuryVester::constructor: cliff is too early');
        require(vestingEnd_ > vestingCliff_, 'TreasuryVester::constructor: end is too early');
        factory = factory_;
        route = route_;
        recipient = recipient_;

        vestingAmount = vestingAmount_;
        vestingCliff = vestingCliff_;
        vestingEnd = vestingEnd_;
        lastUpdate = vestingCliff;
        if(bonus_!=0){
            bonus = bonus_.mul(vestingAmount).div(100);
            vestingAmount = vestingAmount.sub(bonus);
        }
    }
    modifier onlyFactory() {
        require(msg.sender == factory, "TreasuryVester::onlyFactory: caller is not factory address");
        _;
    }
    function setRecipient(address recipient_) public {
        require(msg.sender == recipient, 'TreasuryVester::setRecipient: unauthorized');
        recipient = recipient_;
    }

    function claim() public {
        require(block.timestamp >= vestingCliff, 'TreasuryVester::claim: not time yet');
        uint amount;
        if (block.timestamp >= vestingEnd) {
            amount = IRoute(route).balanceOf(address(this));
        } else {
            amount = vestingAmount.mul(block.timestamp - lastUpdate).div(vestingEnd - vestingCliff);
            lastUpdate = block.timestamp;
            if(bonus>0){
                amount = amount.add(bonus);
                bonus = 0;
            }
        }
        IRoute(route).transfer(recipient, amount);
    }

    function rescue() public onlyFactory {
        IRoute(route).transfer(msg.sender, IRoute(route).balanceOf(address(this)));
    }
}

interface IRoute {
    function balanceOf(address account) external view returns (uint);
    function transfer(address dst, uint rawAmount) external returns (bool);
}